/**
 * LLM 节点的 Prompt 骨架与 JSON Schema 协议定义。
 *
 * 设计原则（对应产品架构讨论结论）：
 * - 不做自由多 Agent 对话，而是"单一编排工作流 + 4 个专业节点"
 * - 每个节点输入输出都是严格 JSON，节点之间不靠自然语言传话
 * - 每个节点的 system prompt 都固定引用同一套方法论规则，而不是每次现场重新解释
 * - 生成类节点必须输出 sentence_evidence_map，做句子级事实校验，防止无依据编造
 *
 * 当前文件只是"协议 + 模板"，不直接发起网络请求。
 * 真正的调用编排在 provider.ts 中完成，本文件被 provider.ts 与 ruleEngine.ts 共同引用，
 * 以保证"免费规则版"和"未来 LLM 版"遵循同一套字段契约，切换时前端 UI 无需改动。
 */

import type { LlmNodeType, PromptTemplates } from '@/types';

/** 每个节点对应的 Prompt 版本号，用于审计日志与后续 A/B 迭代 */
export const PROMPT_VERSIONS: Record<LlmNodeType, string> = {
  jd_analysis: 'jd-analysis-v1',
  jd_matching: 'jd-matching-v1',
  internship_generation: 'gen-internship-v1',
  project_generation: 'gen-project-v1',
};

/** 方法论核心约束：作为所有节点 system prompt 的公共前缀注入 */
export const METHODOLOGY_CORE_RULES = `
你是一名资深校招/社招简历顾问，严格遵循以下底层逻辑工作：

1. 核心逻辑：JD 是需求清单，简历是供给清单。你的任务是做"需求-供给匹配"，而不是罗列或堆砌信息。
2. 名词（工具、平台、技术栈）是配角，动词（能力动作）+ 结果才是核心匹配依据。禁止仅因为提及同一个工具名词就判定为强匹配。
3. 业务背景要做"方向判断"，产出负向筛选信号（哪些经历类型不适合作为主线），而不是简单摘录 JD 原文。
4. 工作内容要做四层拆解：核心动作(core_action) → 背后能力(required_capability) → 需要证据(evidence_type) → 提取方向(extraction_hint)。
5. 软性素质要做"行为翻译"：把抽象形容词（如"高同理心""强抗压能力"）翻译成客观可验证的具体行为，禁止在最终输出中保留未翻译的抽象自评。
6. 结果价值校验：所有匹配与生成内容必须体现"解决了什么问题 / 带来了什么价值"，不能只是动作描述。
7. 严禁编造或过度推断简历中不存在的事实。无法确认的内容要在风险字段中明确标注，而不是直接写入正文。
8. 所有输出必须是严格符合给定 JSON Schema 的 JSON，不要输出任何多余的解释文字、Markdown 代码块标记或自然语言前后缀。
`.trim();

// ==================== 节点①：JD 解析 ====================

export const JD_ANALYSIS_TEMPLATE = `
{{coreRules}}

当前任务：对输入的 JD 文本做结构化拆解，输出以下字段（JSON）：
- background: { rawSentences: string[], direction: string, negativeSignals: string[] }
- responsibilities: Array<{ rawText, coreAction, requiredCapability, evidenceType, extractionHint, priority: 'core'|'secondary' }>
  （重要：必须逐条覆盖 JD 中列出的【每一条】工作职责/岗位职责，不得遗漏任何一条，也不得将多条职责合并成一条；
    JD 中未编号的职责同样要单独成条提取；职责可能以名词短语或不同句式书写，请按其实际语义判断，不要只挑含"负责/参与"等动词的句子）
- hardRequirements: Array<{ rawText }>
- softSkills: Array<{ rawText, behaviorTranslation, extractionHint }>
- bonusPoints: Array<{ rawText, extractionHint }>
- toolKeywords: string[]
- negativeFilterList: string[]
`.trim();

export interface JdAnalysisLlmOutput {
  background: { rawSentences: string[]; direction: string; negativeSignals: string[] };
  responsibilities: Array<{
    rawText: string;
    coreAction: string;
    requiredCapability: string;
    evidenceType: string;
    extractionHint: string;
    priority: 'core' | 'secondary';
  }>;
  hardRequirements: Array<{ rawText: string }>;
  softSkills: Array<{ rawText: string; behaviorTranslation: string; extractionHint: string }>;
  bonusPoints: Array<{ rawText: string; extractionHint: string }>;
  toolKeywords: string[];
  negativeFilterList: string[];
}

// ==================== 节点②：JD 匹配 ====================

export const JD_MATCHING_TEMPLATE = `
{{coreRules}}

当前任务：将「JD 解析结果」中的每条 responsibility / hardRequirement / bonusPoint 与「个人经历库」逐条比对，
输出匹配结果数组，每项包含：
- requirement, coreActionRequired
- matchedExperienceType: 'internship' | 'project' | null
- matchedExperienceId
- matchedAction（该经历中实际发生的核心动作）
- valueEvidence（该经历体现的结果价值，没有则为空字符串）
- evidence（证据描述）
- matchLevel: 'strong' | 'partial' | 'weak' | 'no_evidence'
- matchReason（判定理由，需说明动作是否一致、结果证据是否充分）
- missingInfo（缺什么信息）
- riskOfOverclaim（是否存在夸大风险）

打分参考权重：核心动作一致 40% + 结果价值证据 30% + 场景相似 20% + 工具重合 10%。

实习与项目的分工原则（重要，匹配时必须遵守）：
- 实习经历回答的是"我已经在公司环境中做过 JD 上写的这类工作"，因此 responsibility（工作内容）类要求，
  在动作/场景相关度相近的情况下，应优先匹配到实习经历，而不是项目经历；
- 项目经历回答的是"即使实习没接触，我也有能力把这件事做出来"，因此 bonusPoint（加分项）以及偏工具/技能类的
  要求，在动作/场景相关度相近的情况下，应优先匹配到项目经历，而不是实习经历；
- 只有当某一类型经历完全没有相关证据时，才允许匹配到另一类型经历，此时应在 matchReason 中说明
  "本应由实习/项目承接，但该类型经历中未找到证据，改用另一类型经历替代"。
`.trim();

export interface JdMatchingLlmOutput {
  matches: Array<{
    requirement: string;
    coreActionRequired: string;
    matchedExperienceType: 'internship' | 'project' | null;
    matchedExperienceId?: string;
    matchedAction: string;
    valueEvidence: string;
    evidence: string;
    matchLevel: 'strong' | 'partial' | 'weak' | 'no_evidence';
    matchReason: string;
    missingInfo: string;
    riskOfOverclaim: string;
  }>;
}

// ==================== 节点③④：经历内容生成（实习/项目通用） ====================

/**
 * 设计变更（对应产品讨论结论）：
 * 用户提供的详细经历是"事实素材库"，不是可以直接展示的成品文案。
 * 生成节点不再"从经历库里挑一条直接套模板"，而是：
 * 1. 对该类型（实习 或 项目）下的每一条原始经历，先拆解成多个"事实片段"
 *    （背景/角色/动作/方法工具/结果数据/协作方式/待确认信息）；
 * 2. 按匹配打分权重（核心动作40% + 结果价值证据30% + 场景相似20% + 工具重合10%）
 *    对每条经历计算与当前 JD 的综合推荐分，且实习/项目对"职责类"与"加分项类"要求的权重不同（见下）；
 * 3. 筛选规则：若该类型下经历总数 <= 3 条，全部保留并逐条润色包装，不做淘汰
 *    （经历本来就不多，不应该再筛掉，否则用户会觉得"明明只有几条经历却看不到全部"）；
 *    只有经历总数 > 3 条时，才取该类型下分数最高的 2-3 条经历进入推荐结果（同类型内部排序，不与另一类型混选）；
 * 4. 对选中的每条经历，只保留和重组跟 JD 相关的事实片段，按"实习/项目差异化 STAR 侧重点"生成
 *    简历版 + STAR 版，无关信息主动省略，不为了"介绍完整项目"而堆砌无关内容；
 * 5. 未被选中的经历需要给出原因，而不是静默丢弃。
 */
export const GENERATION_TEMPLATE = `
{{coreRules}}

实习与项目的本质区别（重要，贯穿以下所有步骤，严格遵守）：
- 实习经历回答的是："我已经在公司环境中做过 JD 上写的这类工作。"
  它发生在真实公司业务环境中，有上级、业务同事、明确的业务目标、工作职责和协作约束。
  因此实习应优先承接 JD 的"工作内容"（responsibilities）类要求，重点体现岗位职责、业务协作、职场交付。
- 项目经历回答的是："即使实习没接触，我也有能力把这件事做出来。"
  它可能来自课程、个人 Side Project、竞赛或课题，不一定有真实业务 KPI 或处于公司环境。
  因此项目应优先承接 JD 中"实习未覆盖"的技能、工具和加分项（bonusPoints），重点体现技术实现、方案设计、自主探索。
- 打分时：实习经历对 responsibilities（工作内容）类要求的匹配权重应高于对 bonusPoints（加分项）类要求；
  项目经历则相反，对 bonusPoints 与工具关键词的匹配权重应高于对 responsibilities 类要求。
  即"职责类要求优先由实习证明，加分项/技能类要求优先由项目证明"。

当前任务：输入为「JD 解析结果」+「该类型（实习或项目）下的全部原始经历列表」，你需要：

第一步 - 事实片段拆解：对每条原始经历，拆解出若干事实片段（背景/角色/具体动作/方法工具/结果数据/协作方式），
  标注哪些片段有明确数据或结论支撑、哪些片段信息不完整需要向用户确认。

第二步 - 打分排序：按权重（核心动作一致40% + 结果价值证据30% + 场景相似20% + 工具重合10%）
  为每条经历计算 matchScore（0-100），仅在同类型内部排序，且遵循上述"实习/项目分工权重"。

第三步 - 筛选规则（重要，严格遵守）：
  - 若该类型（实习或项目）下经历总数 <= 3 条：全部经历都进入 recommended 正式推荐结果，
    不做任何淘汰，unrecommended 必须为空数组。即使某条经历打分很低，也要保留并如实润色，
    可以在 riskFlags 中提示"与 JD 匹配度较低"，但不能把它排除在 recommended 之外。
  - 若该类型下经历总数 > 3 条：取分数最高的 2-3 条经历进入 recommended，其余进入 unrecommended
    列表并说明原因（如"仅工具重合，缺少能力动作与结果证据""方向与岗位要求不一致"等）。

第四步 - 针对性包装（STAR 必须按实习/项目差异化组织，不能用同一套模板）：

  若当前 kind 为 internship（实习），STAR 应这样组织：
  - S（情境）：公司业务背景、所在业务线、实习岗位和职责范围；
  - T（任务）：公司分配的工作职责、业务目标，是对接 JD 的核心入口；
  - A（行动）：在公司协作和约束下采取的行动，除了技术/业务动作本身，
    还必须体现职场协作行为，如与业务方沟通、参加评审、同步进度、收集反馈、多轮迭代；
  - R（结果）：优先写业务结果、交付物、效率提升和业务方反馈，技术指标作为补充说明，不能只写技术指标。

  若当前 kind 为 project（项目），STAR 应这样组织：
  - S（情境）：课程、个人兴趣或现实问题背景（不要编造成公司业务场景）；
  - T（任务）：自己定义的目标，或导师、课程、竞赛给定的课题目标；
  - A（行动）：方案拆解、工具选型、技术实现、踩坑和迭代过程，突出自主探索与动手能力；
  - R（结果）：优先写原型效果、技术指标、可行性验证结论，没有真实业务数据时可以写预期收益或个人成果，
    但不能虚构不存在的数字。

  生成以下字段：
- resumeVersion（3-5 条精炼要点，动词开头，含量化结果）
- starVersion: { situation, task, action, result }（按上述 kind 对应的侧重点组织）
- factBasis: string[]（事实依据标签，如时间、数据、规模）
- sentenceEvidenceMap: Array<{ sentence, sourceField, evidenceType: 'fact_supported'|'reasonable_rewrite'|'needs_confirmation' }>
  要求 resumeVersion 与 starVersion 中的每一个关键句子都能在此数组中找到对应溯源记录。
- usedJdRequirements: string[]（本次生成主要引用了哪些 JD 要求）
- usedFactFragments: string[]（本次实际使用了哪些事实片段，未使用的片段视为主动省略）
- matchedRequirements: string[]（与 usedJdRequirements 一致，用于卡片摘要展示）
- riskFlags: string[]（存在的夸大或无法验证的风险点，若无风险则为空数组）

输出结构：
{
  recommended: Array<{ sourceExperienceId, sourceExperienceLabel, matchScore, matchedRequirements, usedFactFragments,
    resumeVersion, starVersion, factBasis, sentenceEvidenceMap, usedJdRequirements, riskFlags }>,
  unrecommended: Array<{ experienceId, experienceLabel, matchScore, reason }>
}

禁止事项：
- 不得编造原始经历中不存在的数据或结果；如需合理润色，必须在 sentenceEvidenceMap 中标记为 reasonable_rewrite 并说明依据；
- 不得为了显得"完整"而把与 JD 无关的事实片段也写入正文；
- 不得把实习写成纯技术项目（忽略岗位职责和业务协作），也不得把项目虚构成公司业务协作场景；
- JD 需要但经历中确实没有证据支撑的内容（如"独立负责""从0到1""提升30%"），只能在 riskFlags 中提示待确认，不能写入正文冒充事实。
`.trim();

export interface GenerationLlmRecommendedItem {
  sourceExperienceId: string;
  sourceExperienceLabel: string;
  matchScore: number;
  matchedRequirements: string[];
  usedFactFragments: string[];
  resumeVersion: string;
  starVersion: { situation: string; task: string; action: string; result: string };
  factBasis: string[];
  sentenceEvidenceMap: Array<{
    sentence: string;
    sourceField: string;
    evidenceType: 'fact_supported' | 'reasonable_rewrite' | 'needs_confirmation';
  }>;
  usedJdRequirements: string[];
  riskFlags: string[];
}

export interface GenerationLlmUnrecommendedItem {
  experienceId: string;
  experienceLabel: string;
  matchScore: number;
  reason: string;
}

export interface GenerationLlmOutput {
  recommended: GenerationLlmRecommendedItem[];
  unrecommended: GenerationLlmUnrecommendedItem[];
}

// ==================== 图片理解模块专用 Prompt ====================

/**
 * 视觉提取是「只提取、不生成」的环节：只把图片里说了什么如实转成文字，
 * 不做结构化、不做判断、不产出 JSON。
 * 因此这里独立于方法论核心规则，是一段固定 prompt，运行时强制低温以保证稳定。
 */
export const VISION_EXTRACTION_PROMPT = `你是一个精确的图片文字提取器。

任务：把图片中的所有文字内容完整、忠实地转成纯文本。

要求：
1. 完整输出图片中出现的全部文字，按原有顺序（从上到下、从左到右），不要遗漏任何一段职责、要求、加分项或标题。
2. 保持原文的段落与条目结构，不同段落之间用换行分隔。
3. 只输出图片中真实存在的内容，绝不补充、推测、改写或总结。
4. 不要添加任何解释性说明、标题、Markdown 代码块标记或前后缀，直接输出文字本身。
5. 若某处文字模糊无法辨认，用「[模糊]」标注，不要猜测内容。
6. 若图片中没有任何文字，直接输出「[图片中未识别到文字]」。`.trim();

// ==================== 模板渲染与默认值 ====================

/** 把 {{coreRules}} 占位符替换为实际的方法论核心规则 */
export function renderPrompt(template: string, coreRules: string): string {
  return template.replace(/\{\{coreRules\}\}/g, coreRules);
}

/** 出厂默认模板，供「模型设置」中的「恢复默认」使用 */
export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  coreRules: METHODOLOGY_CORE_RULES,
  jdAnalysis: JD_ANALYSIS_TEMPLATE,
  jdMatching: JD_MATCHING_TEMPLATE,
  generation: GENERATION_TEMPLATE,
  visionExtraction: VISION_EXTRACTION_PROMPT,
};

/**
 * 取得一份可直接使用的模板：缺字段或为空一律用出厂默认补齐。
 * 用户可能只编辑了其中一两项，也可能存了旧版本数据，这里统一兜底。
 */
export function resolvePromptTemplates(saved?: Partial<PromptTemplates> | null): PromptTemplates {
  return {
    coreRules: saved?.coreRules?.trim() || DEFAULT_PROMPT_TEMPLATES.coreRules,
    jdAnalysis: saved?.jdAnalysis?.trim() || DEFAULT_PROMPT_TEMPLATES.jdAnalysis,
    jdMatching: saved?.jdMatching?.trim() || DEFAULT_PROMPT_TEMPLATES.jdMatching,
    generation: saved?.generation?.trim() || DEFAULT_PROMPT_TEMPLATES.generation,
    visionExtraction: saved?.visionExtraction?.trim() || DEFAULT_PROMPT_TEMPLATES.visionExtraction,
  };
}
