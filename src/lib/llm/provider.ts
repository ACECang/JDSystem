/**
 * 文字生成模块 TextGenerator —— 全系统唯一的生成出口。
 *
 * 架构约定：
 * - 所有生成任务（JD 解析 / 经历匹配 / 内容生成）一律走这里的 callTextModel，
 *   固定使用配置的「文本模型」，只靠不同的 prompt 模板区分任务。
 * - 图片理解不在这里：图片已由上游 VisionExtractor + InputRouter 归一化成文字，
 *   本模块只处理纯文本，因此与输入形态完全解耦。
 * - 双轨制：useLlm 关闭或调用失败时自动降级为规则引擎，保证功能始终可用。
 *
 * 上层业务代码（Workbench.tsx）只调用本文件导出的 analyzeJD / matchExperience / generateContent，
 * 不关心当前是真实大模型还是规则引擎在工作。
 *
 * 每次节点调用都会产出一条 LlmCallLog（返回给调用方落库，落库逻辑在 db.ts 中完成），
 * 为审计、Prompt 迭代、效果评估做数据基础。
 */

import type {
  ExperienceLibrary,
  GeneratedContent,
  JDAnalysis,
  JobTask,
  LlmCallLog,
  LlmNodeType,
  MatchItem,
  ModelSettings,
  UnrecommendedExperience,
} from '@/types';
import { genId, ruleAnalyzeJD, ruleGenerateContent, ruleMatchExperience, type RuleGenerationResult } from './ruleEngine';
import {
  PROMPT_VERSIONS,
  renderPrompt,
  resolvePromptTemplates,
  type GenerationLlmOutput,
  type JdAnalysisLlmOutput,
  type JdMatchingLlmOutput,
} from './promptSchemas';
import { requestChatCompletion } from './http';

/** 将 LLM 返回的 JD 解析结果（仅业务字段）补全为完整的 JDAnalysis（补上各条目的 id、来源标记等） */
function hydrateJdAnalysis(raw: JdAnalysisLlmOutput): JDAnalysis {
  return {
    background: raw.background,
    responsibilities: raw.responsibilities.map((r) => ({ id: genId('resp'), ...r })),
    hardRequirements: raw.hardRequirements.map((h) => ({ id: genId('hard'), ...h })),
    softSkills: raw.softSkills.map((s) => ({ id: genId('soft'), ...s })),
    bonusPoints: raw.bonusPoints.map((b) => ({ id: genId('bonus'), ...b })),
    toolKeywords: raw.toolKeywords,
    negativeFilterList: raw.negativeFilterList,
    analysisSource: 'llm',
    promptVersion: PROMPT_VERSIONS.jd_analysis,
  };
}

/** 将 LLM 返回的匹配结果（仅业务字段）补全为完整的 MatchItem[]（补上每项的 id） */
function hydrateMatchItems(raw: JdMatchingLlmOutput): MatchItem[] {
  return raw.matches.map((m) => ({ id: genId('match'), ...m }));
}

/**
 * 将 LLM 返回的生成结果（仅业务字段）补全为完整的 GeneratedContent[]（补上 id、contentSource、savedVersions 等运行时字段）。
 *
 * 关键防御逻辑（历史版本保留机制的前提）：
 * 数据库层按 sourceExperienceId 关联同一条经历跨次生成的历史版本，这要求 sourceExperienceId
 * 必须是经历库中真实存在的 id。但大模型不能保证 100% 严格返回正确的 id（可能遗漏、编造、
 * 或返回经历名称而非真实 id），一旦这个字段不可信，历史版本关联就会失效、被误删。
 * 因此这里对每条 LLM 返回结果做校验：
 * 1. 若 sourceExperienceId 命中经历库真实 id，直接采用；
 * 2. 若未命中，尝试用 sourceExperienceLabel 反查经历库（公司/角色/名称包含关系）做纠正；
 * 3. 若仍无法确定对应哪条真实经历，说明这条结果不可信，直接丢弃（不进入 recommended），
 *    避免产出一个"查无此经历"的悬空记录污染历史版本关联。
 */
function hydrateGenerationResult(
  raw: GenerationLlmOutput,
  nodeType: LlmNodeType,
  kind: 'internship' | 'project',
  library: ExperienceLibrary,
): GenerationResult {
  const pool = kind === 'internship' ? library.internships : library.projects;
  const idSet = new Set(pool.map((p) => p.id));

  const resolveSourceId = (rawId: string, label: string): string | null => {
    if (rawId && idSet.has(rawId)) return rawId;
    // 反查：用 label 里包含的公司名/角色名/项目名做包含匹配兜底
    const matched = pool.find((p) => {
      const candidateLabel = 'company' in p ? `${p.company}${p.role}` : `${p.name}${p.role}`;
      return label && (candidateLabel.includes(label) || label.includes(candidateLabel) || (rawId && candidateLabel.includes(rawId)));
    });
    return matched ? matched.id : null;
  };

  const recommended: GeneratedContent[] = [];
  for (const item of raw.recommended) {
    const resolvedId = resolveSourceId(item.sourceExperienceId, item.sourceExperienceLabel);
    if (!resolvedId) continue; // 无法确定对应的真实经历，丢弃该条，不产出悬空记录
    recommended.push({
      id: genId('gen'),
      sourceExperienceId: resolvedId,
      sourceExperienceLabel: item.sourceExperienceLabel,
      matchScore: item.matchScore,
      matchedRequirements: item.matchedRequirements,
      usedFactFragments: item.usedFactFragments,
      resumeVersion: item.resumeVersion,
      starVersion: item.starVersion,
      factBasis: item.factBasis,
      sentenceEvidenceMap: item.sentenceEvidenceMap,
      usedJdRequirements: item.usedJdRequirements,
      riskFlags: item.riskFlags,
      savedVersions: [],
      contentSource: 'llm',
      promptVersion: PROMPT_VERSIONS[nodeType],
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    recommended,
    unrecommended: raw.unrecommended.map((u) => ({
      experienceId: u.experienceId,
      experienceLabel: u.experienceLabel,
      matchScore: u.matchScore,
      reason: u.reason,
    })),
  };
}

export interface LlmCallResult<T> {
  data: T;
  log: LlmCallLog;
}

/** 从大模型的自然语言回复中提取出 JSON 主体（兼容模型偶尔会在 JSON 前后夹带解释文字或代码块标记的情况） */
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;
  const start = candidate.indexOf('{');
  const arrStart = candidate.indexOf('[');
  const firstBraceIdx = start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart);
  if (firstBraceIdx === -1) return candidate;
  const isArray = candidate[firstBraceIdx] === '[';
  const lastIdx = candidate.lastIndexOf(isArray ? ']' : '}');
  if (lastIdx === -1) return candidate;
  return candidate.slice(firstBraceIdx, lastIdx + 1);
}

/** 生成任务的温度：需要一定的表达多样性，但不宜过高以免破坏 JSON 结构 */
const GENERATION_TEMPERATURE = 0.3;

/**
 * 唯一的生成出口：所有节点都通过这里调用「文本模型」。
 *
 * @param systemPrompt 已注入方法论核心规则的完整 system prompt
 * @param userPayload  本次任务的输入数据（会被序列化为 JSON 附在 user 消息中）
 */
async function callTextModel<T>(
  settings: ModelSettings,
  systemPrompt: string,
  userPayload: unknown,
): Promise<T> {
  const { apiUrl, apiKey, textModel } = settings;
  if (!textModel) {
    throw new Error('未配置文本模型名称，请在「模型设置」中填写');
  }

  const userContent = `${systemPrompt}\n\n以下是本次任务的输入数据（JSON）：\n${JSON.stringify(userPayload)}\n\n请仅输出符合上述 JSON Schema 约定的 JSON，不要输出任何多余文字。`;

  const content = await requestChatCompletion({
    apiUrl,
    apiKey,
    model: textModel,
    temperature: GENERATION_TEMPERATURE,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  });

  const jsonText = extractJson(String(content));
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new Error('模型返回内容不是合法 JSON，已自动降级为规则引擎');
  }
}

/**
 * 取出本次调用应使用的 prompt 模板，并注入方法论核心规则。
 * 模板来自用户配置（可能在「模型设置」中被编辑过），缺失时回退到出厂默认。
 */
function buildSystemPrompt(settings: ModelSettings, template: string): string {
  const templates = resolvePromptTemplates(settings.prompts);
  return renderPrompt(template, templates.coreRules);
}

function shouldUseLlm(settings: ModelSettings): boolean {
  if (!settings.useLlm) return false;
  return Boolean(settings.apiUrl && settings.apiKey && settings.textModel);
}

function makeLog(
  nodeType: LlmNodeType,
  status: 'success' | 'error',
  requestPayload: unknown,
  responsePayload: unknown,
  durationMs: number,
  errorMessage?: string,
  taskId?: string,
): LlmCallLog {
  return {
    taskId,
    nodeType,
    promptVersion: PROMPT_VERSIONS[nodeType],
    requestPayload,
    responsePayload,
    status,
    errorMessage,
    durationMs,
  };
}

// ==================== 节点①：JD 解析 ====================

export async function analyzeJD(
  jdText: string,
  settings: ModelSettings,
  taskId?: string,
): Promise<LlmCallResult<JDAnalysis>> {
  const start = Date.now();

  if (shouldUseLlm(settings)) {
    try {
      const prompt = buildSystemPrompt(settings, resolvePromptTemplates(settings.prompts).jdAnalysis);
      const raw = await callTextModel<JdAnalysisLlmOutput>(settings, prompt, { jdText });
      const data = hydrateJdAnalysis(raw);
      return { data, log: makeLog('jd_analysis', 'success', { jdText }, data, Date.now() - start, undefined, taskId) };
    } catch (err) {
      const data = ruleAnalyzeJD(jdText);
      data.ruleReason = `LLM 调用失败已降级为规则引擎：${(err as Error).message}`;
      return {
        data,
        log: makeLog(
          'jd_analysis',
          'error',
          { jdText },
          data,
          Date.now() - start,
          `LLM 调用失败已降级为规则引擎：${(err as Error).message}`,
          taskId,
        ),
      };
    }
  }

  const data = ruleAnalyzeJD(jdText);
  return { data, log: makeLog('jd_analysis', 'success', { jdText }, data, Date.now() - start, undefined, taskId) };
}

// ==================== 节点②：JD 匹配 ====================

export async function matchExperience(
  analysis: JDAnalysis,
  library: ExperienceLibrary,
  settings: ModelSettings,
  taskId?: string,
): Promise<LlmCallResult<MatchItem[]>> {
  const start = Date.now();

  if (shouldUseLlm(settings)) {
    try {
      const prompt = buildSystemPrompt(settings, resolvePromptTemplates(settings.prompts).jdMatching);
      const raw = await callTextModel<JdMatchingLlmOutput>(settings, prompt, { analysis, library });
      const data = hydrateMatchItems(raw);
      return { data, log: makeLog('jd_matching', 'success', { analysis, library }, data, Date.now() - start, undefined, taskId) };
    } catch (err) {
      const data = ruleMatchExperience(analysis, library);
      return {
        data,
        log: makeLog(
          'jd_matching',
          'error',
          { analysis, library },
          data,
          Date.now() - start,
          `LLM 调用失败已降级为规则引擎：${(err as Error).message}`,
          taskId,
        ),
      };
    }
  }

  const data = ruleMatchExperience(analysis, library);
  return { data, log: makeLog('jd_matching', 'success', { analysis, library }, data, Date.now() - start, undefined, taskId) };
}

// ==================== 节点③④：内容生成 ====================
//
// 输出结构升级：不再是单份 GeneratedContent，而是「Top 2-3 推荐结果 + 未推荐经历列表」，
// 由 ruleEngine.ruleGenerateContent 内部完成打分排序与事实片段包装。

export interface GenerationResult {
  recommended: GeneratedContent[];
  unrecommended: UnrecommendedExperience[];
}

export async function generateContent(
  kind: 'internship' | 'project',
  task: JobTask,
  library: ExperienceLibrary,
  settings: ModelSettings,
): Promise<LlmCallResult<GenerationResult>> {
  const start = Date.now();
  const nodeType: LlmNodeType = kind === 'internship' ? 'internship_generation' : 'project_generation';

  if (shouldUseLlm(settings)) {
    try {
      const prompt = buildSystemPrompt(settings, resolvePromptTemplates(settings.prompts).generation);
      const raw = await callTextModel<GenerationLlmOutput>(settings, prompt, { task, library, kind });
      const data = hydrateGenerationResult(raw, nodeType, kind, library);
      return { data, log: makeLog(nodeType, 'success', { task, library }, data, Date.now() - start, undefined, task.id) };
    } catch (err) {
      const data: RuleGenerationResult = ruleGenerateContent(kind, task, library);
      const reason = `LLM 调用失败已降级为规则引擎：${(err as Error).message}`;
      data.recommended.forEach((c) => {
        c.ruleReason = reason;
      });
      return {
        data,
        log: makeLog(
          nodeType,
          'error',
          { task, library },
          data,
          Date.now() - start,
          reason,
          task.id,
        ),
      };
    }
  }

  const data: RuleGenerationResult = ruleGenerateContent(kind, task, library);
  return { data, log: makeLog(nodeType, 'success', { task, library }, data, Date.now() - start, undefined, task.id) };
}
