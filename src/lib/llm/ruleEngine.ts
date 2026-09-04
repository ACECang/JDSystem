/**
 * 免费规则引擎：不依赖大模型，用关键词规则 + 启发式方法逼近方法论要求。
 *
 * 输出结构与 llm/promptSchemas.ts 中定义的 LLM 输出协议保持一致，
 * 这样未来切换到真实 LLM 调用时，上层业务代码（Workbench.tsx）无需改动。
 *
 * 局限性说明（如实告知用户）：
 * - "方向判断" "行为翻译" "结果价值校验" 本质需要语义理解，规则引擎只能做有限逼近，
 *   使用关键词库 + 句式模板，无法达到真正的语义级拆解水平。
 * - 该引擎的产出仅作为"免费版"兜底，条件允许时应引导用户开启大模型模式获得更准确的结果。
 */

import type {
  JDAnalysis,
  JdResponsibility,
  JdSoftSkill,
  MatchItem,
  ExperienceLibrary,
  JobTask,
  GeneratedContent,
  StarVersion,
  UnrecommendedExperience,
  InternshipExperience,
  ProjectExperience,
} from '@/types';

/** 生成带前缀的唯一 id，规则引擎与真实 LLM 调用后的补全转换（provider.ts）共用此实现，保持 id 格式一致。 */
export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/[。;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------- 五分类关键词库 ----------------

const BACKGROUND_KEYWORDS = ['团队', '业务', '负责人', '现状', '面临', '快速发展', '扩张', '成立', '战略', '规模'];
const RESPONSIBILITY_KEYWORDS = ['负责', '参与', '推进', '推动', '牵头', '完成', '协助', '主导', '设计', '开发', '优化', '搭建', '跟进', '执行'];
const HARD_REQUIREMENT_KEYWORDS = ['本科', '硕士', '学历', '专业', '熟悉', '掌握', '精通', 'years', '年经验', '证书'];
const SOFT_SKILL_KEYWORDS = ['沟通', '抗压', '责任心', '学习能力', '自驱', '协作', '同理心', '主动性', '严谨', '细致', '抗压能力'];
const BONUS_KEYWORDS = ['优先', '加分', '有...经验者', '大厂经历', '开源', '竞赛获奖'];

/** 核心动作词库：动词 -> 背后能力 的映射（简化启发式） */
const ACTION_CAPABILITY_MAP: Array<{ pattern: RegExp; coreAction: string; capability: string; evidenceType: string }> = [
  { pattern: /(调研|访谈|需求梳理)/, coreAction: '业务调研', capability: '主动发现问题、与业务方沟通', evidenceType: '调研记录/访谈纪要/需求文档' },
  { pattern: /(设计|架构|方案)/, coreAction: '方案设计', capability: '系统性思考、权衡取舍', evidenceType: '设计文档/架构图/技术方案' },
  { pattern: /(开发|实现|编码|搭建)/, coreAction: '工程实现', capability: '动手落地能力', evidenceType: '代码产出/上线记录' },
  { pattern: /(优化|提升|改进)/, coreAction: '性能/流程优化', capability: '发现瓶颈并推动改进', evidenceType: '优化前后数据对比' },
  { pattern: /(推进|协调|跟进|对接)/, coreAction: '项目推进', capability: '跨团队协作与推动力', evidenceType: '项目进度证明/协作记录' },
  { pattern: /(分析|评估|复盘)/, coreAction: '数据分析', capability: '结构化分析能力', evidenceType: '分析报告/复盘文档' },
];

/** 软性素质：抽象自评 -> 客观行为翻译 */
const SOFT_SKILL_TRANSLATION: Record<string, { behavior: string; hint: string }> = {
  沟通: { behavior: '在跨角色协作中主动同步信息、推动对齐，可用具体协作案例证明', hint: '寻找与多方角色沟通并推动结论落地的经历' },
  抗压: { behavior: '在时间紧张或多任务并行场景下仍保证按时交付', hint: '寻找 deadline 紧张或突发情况下按时完成任务的经历' },
  责任心: { behavior: '主动跟进任务至闭环，出现问题主动补救而非被动等待安排', hint: '寻找主动发现并解决问题、避免推诿的经历' },
  学习能力: { behavior: '短时间内掌握新工具/新领域知识并产出实际成果', hint: '寻找快速上手陌生技术或业务并落地的经历' },
  自驱: { behavior: '无需明确指派即主动发起并推动一件事完成', hint: '寻找非分配任务、自己主动发起并完成的经历' },
  协作: { behavior: '与团队成员分工配合，共同完成目标，能说明自己承担的具体部分', hint: '寻找团队协作中承担明确职责的经历' },
  同理心: { behavior: '能从用户/业务方角度理解诉求并据此调整方案', hint: '寻找因理解用户/业务方真实诉求而调整方案的经历' },
  严谨: { behavior: '对细节和数据准确性有核查习惯，能举出发现并纠正错误的例子', hint: '寻找因严谨核查而避免问题或纠错的经历' },
};

function translateSoftSkill(rawText: string): { behavior: string; hint: string } {
  for (const key of Object.keys(SOFT_SKILL_TRANSLATION)) {
    if (rawText.includes(key)) return SOFT_SKILL_TRANSLATION[key];
  }
  return {
    behavior: `需具备与"${rawText}"对应的可验证行为证据，而非停留在自评层面`,
    hint: `寻找能体现"${rawText}"的具体行为片段（有场景、有动作、有结果）`,
  };
}

function inferCoreAction(rawText: string): { coreAction: string; capability: string; evidenceType: string } {
  for (const rule of ACTION_CAPABILITY_MAP) {
    if (rule.pattern.test(rawText)) {
      return { coreAction: rule.coreAction, capability: rule.capability, evidenceType: rule.evidenceType };
    }
  }
  return { coreAction: '通用执行动作', capability: '任务执行与结果交付能力', evidenceType: '可量化的任务成果' };
}

/** 方向判断：基于业务背景句子中的关键词做粗粒度启发式分类 */
function inferDirection(rawSentences: string[]): { direction: string; negativeSignals: string[] } {
  const text = rawSentences.join('');
  if (/(用户|体验|产品|运营)/.test(text)) {
    return {
      direction: '业务/用户价值导向：更看重能否理解业务诉求并落地解决方案',
      negativeSignals: ['纯理论研究、无业务落地场景的经历不建议作为主线', '与用户/业务方无实际接触的经历说服力较弱'],
    };
  }
  if (/(架构|系统|高并发|稳定性|性能)/.test(text)) {
    return {
      direction: '技术深度导向：更看重工程能力与系统设计的扎实程度',
      negativeSignals: ['仅停留在使用层面、未涉及设计与优化的经历不建议作为主线', '纯业务运营类经历与该方向匹配度较低'],
    };
  }
  if (/(数据|分析|算法|模型)/.test(text)) {
    return {
      direction: '数据/算法导向：更看重分析方法的严谨性与结果的可衡量性',
      negativeSignals: ['缺乏量化结果的经历说服力不足', '纯执行型、无分析过程的经历不建议作为主线'],
    };
  }
  return {
    direction: '综合执行导向：看重任务的完整交付能力',
    negativeSignals: ['缺乏明确结果或数据支撑的经历建议弱化处理'],
  };
}

// ==================== 节点①：JD 解析（规则版） ====================

export function ruleAnalyzeJD(jdText: string): JDAnalysis {
  const sentences = splitSentences(jdText);

  const backgroundSentences = sentences.filter((s) => BACKGROUND_KEYWORDS.some((k) => s.includes(k)));
  const responsibilitySentences = sentences.filter((s) => RESPONSIBILITY_KEYWORDS.some((k) => s.includes(k)));
  const hardReqSentences = sentences.filter((s) => HARD_REQUIREMENT_KEYWORDS.some((k) => s.includes(k)));
  const softSkillSentences = sentences.filter((s) => SOFT_SKILL_KEYWORDS.some((k) => s.includes(k)));
  const bonusSentences = sentences.filter((s) => BONUS_KEYWORDS.some((k) => s.includes(k)));

  // 工作内容的提取不能「只要命中动作动词就结束」——
  // JD 里大量职责以名词短语或不同句式书写（如"高并发场景下的故障快速定位""用户增长策略的制定与落地"），
  // 不含"负责/参与/开发"等动词词库字眼，会被上面的关键词过滤漏掉。原兜底逻辑
  // （responsibilitySentences.length>0 就只用它、其余句子丢进 leftover 忽略）正是"只解析前几项"的根因。
  // 现改为：把「明确命中职责动词的句子」与「未被其他更具体类别（背景/硬要求/软技能/加分项）认领的句子」
  // 合并作为工作内容候选，保证 JD 全文的职责尽量不漏（规则引擎是兜底，重点是"不漏"而非"不噪"）。
  const TITLE_HINTS = ['岗位职责', '职位描述', '工作要求', '工作内容', 'responsibilities', 'job description'];
  const isTitleOnly = (s: string): boolean => s.length < 14 && TITLE_HINTS.some((h) => s.includes(h));
  const used = new Set([...backgroundSentences, ...hardReqSentences, ...softSkillSentences, ...bonusSentences]);
  const leftover = sentences.filter((s) => !used.has(s) && !isTitleOnly(s));
  const finalResponsibilities = Array.from(new Set([...responsibilitySentences, ...leftover]));

  const { direction, negativeSignals } = inferDirection(backgroundSentences.length > 0 ? backgroundSentences : sentences);

  const responsibilities: JdResponsibility[] = finalResponsibilities.map((rawText, idx) => {
    const { coreAction, capability, evidenceType } = inferCoreAction(rawText);
    return {
      id: genId('resp'),
      rawText,
      coreAction,
      requiredCapability: capability,
      evidenceType,
      extractionHint: `在个人经历中寻找与"${coreAction}"对应的具体动作与结果`,
      priority: idx < 3 ? 'core' : 'secondary',
    };
  });

  const softSkills: JdSoftSkill[] = softSkillSentences.map((rawText) => {
    const { behavior, hint } = translateSoftSkill(rawText);
    return {
      id: genId('soft'),
      rawText,
      behaviorTranslation: behavior,
      extractionHint: hint,
    };
  });

  // 工具关键词提取：大写字母组合/常见技术词粗略提取
  const toolKeywords = Array.from(
    new Set(
      (jdText.match(/[A-Za-z][A-Za-z0-9+.#]{1,20}/g) || []).filter((w) => w.length >= 2),
    ),
  ).slice(0, 20);

  return {
    background: {
      rawSentences: backgroundSentences.length > 0 ? backgroundSentences : sentences.slice(0, 1),
      direction,
      negativeSignals,
    },
    responsibilities,
    hardRequirements: hardReqSentences.map((rawText) => ({ id: genId('hard'), rawText })),
    softSkills,
    bonusPoints: bonusSentences.map((rawText) => ({
      id: genId('bonus'),
      rawText,
      extractionHint: `寻找能直接证明"${rawText}"的经历，若无则不建议强行凑数`,
    })),
    toolKeywords,
    negativeFilterList: negativeSignals,
    analysisSource: 'rule_engine',
    promptVersion: 'rule-engine-v1',
  };
}

// ==================== 节点②：JD 匹配（规则版） ====================

function textOverlapScore(a: string, b: string): number {
  const aWords = new Set(a.replace(/[，。、,.]/g, ' ').split(/\s+/).filter((w) => w.length >= 2));
  const bWords = new Set(b.replace(/[，。、,.]/g, ' ').split(/\s+/).filter((w) => w.length >= 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let overlap = 0;
  aWords.forEach((w) => {
    if (bWords.has(w)) overlap += 1;
  });
  return overlap / Math.max(aWords.size, 1);
}

/**
 * 匹配时的候选经历加权（对应方法论文档第二部分结论）：
 * - "工作内容"类要求优先由实习经历承接（证明"已经在职场做过类似工作"），
 *   同等相关度下，实习候选应比项目候选更容易被判定为该要求的最佳匹配；
 * - "加分项"类要求优先由项目经历承接（证明"即使实习没接触，我也能自己做出来补齐能力"），
 *   同等相关度下，项目候选应比实习候选更容易被判定为该要求的最佳匹配。
 * 硬性门槛与软性素质不在此处匹配（硬性门槛仅用于自检，软性素质走行为翻译后另行处理）。
 */
const TARGET_KIND_PREFERENCE: Record<'responsibility' | 'bonus', Record<'internship' | 'project', number>> = {
  responsibility: { internship: 1, project: 0.75 },
  bonus: { internship: 0.75, project: 1 },
};

export function ruleMatchExperience(analysis: JDAnalysis, library: ExperienceLibrary): MatchItem[] {
  const candidates: Array<{ type: 'internship' | 'project'; id: string; text: string; result: string }> = [
    ...library.internships.map((i) => ({
      type: 'internship' as const,
      id: i.id,
      text: `${i.role} ${i.description} ${i.highlights.join(' ')}`,
      result: i.description,
    })),
    ...library.projects.map((p) => ({
      type: 'project' as const,
      id: p.id,
      text: `${p.role} ${p.description} ${p.techStack.join(' ')} ${p.highlights.join(' ')}`,
      result: p.description,
    })),
  ];

  const targets = [
    ...analysis.responsibilities.map((r) => ({ requirement: r.rawText, coreAction: r.coreAction, targetKind: 'responsibility' as const })),
    ...analysis.bonusPoints.map((b) => ({ requirement: b.rawText, coreAction: '加分项匹配', targetKind: 'bonus' as const })),
  ];

  return targets.map(({ requirement, coreAction, targetKind }) => {
    let best: { score: number; candidate: (typeof candidates)[number] | null } = { score: 0, candidate: null };
    for (const c of candidates) {
      const baseScore = textOverlapScore(requirement, c.text) * 0.6 + textOverlapScore(coreAction, c.text) * 0.4;
      const score = baseScore * TARGET_KIND_PREFERENCE[targetKind][c.type];
      if (score > best.score) best = { score, candidate: c };
    }

    if (!best.candidate || best.score < 0.08) {
      return {
        id: genId('match'),
        requirement,
        coreActionRequired: coreAction,
        matchedExperienceType: null,
        matchedExperienceId: undefined,
        matchedAction: '',
        valueEvidence: '',
        evidence: '暂无对应经历，建议补充或弱化该项',
        matchLevel: 'no_evidence',
        matchReason: '经历库中未找到动作或场景相关的证据',
        missingInfo: `缺少能体现"${coreAction}"的经历`,
        riskOfOverclaim: '若强行使用无关经历描述该项，存在夸大风险',
      };
    }

    const level: MatchItem['matchLevel'] = best.score >= 0.35 ? 'strong' : best.score >= 0.18 ? 'partial' : 'weak';

    return {
      id: genId('match'),
      requirement,
      coreActionRequired: coreAction,
      matchedExperienceType: best.candidate.type,
      matchedExperienceId: best.candidate.id,
      matchedAction: coreAction,
      valueEvidence: best.candidate.result,
      evidence: best.candidate.text.slice(0, 80),
      matchLevel: level,
      matchReason:
        level === 'strong'
          ? '动作与场景高度重合，且经历中含有可量化结果'
          : level === 'partial'
          ? '动作方向一致，但结果证据不够充分，建议补充数据'
          : '仅存在关键词层面的弱相关，动作本质并不一致',
      missingInfo: level === 'strong' ? '' : '建议补充量化结果或更贴近的场景描述',
      riskOfOverclaim: level === 'weak' ? '直接用于该项存在夸大风险，建议谨慎表述' : '',
    };
  });
}

// ==================== 节点③④：内容生成（规则版） ====================
//
// 设计原则（对应产品讨论结论）：
// 用户录入的详细经历是"事实素材库"，不是成品文案。本节点需要：
// 1. 把每条经历的 description 拆成多个"事实片段"（分句）；
// 2. 按打分权重（核心动作40% + 结果价值证据30% + 场景相似20% + 工具重合10%）
//    计算该经历与当前 JD 的综合匹配分（0-100）；
// 3. 同类型（实习/项目）内部排序，取 Top 2-3 进入推荐结果，其余进入未推荐列表并说明原因；
// 4. 对选中的经历，只挑出与 JD 相关的事实片段重新组织成 STAR 叙事，不相关片段主动省略；
// 5. 每条推荐结果都是独立的 GeneratedContent，互不覆盖。

type LibraryItem = InternshipExperience | ProjectExperience;

function isInternshipItem(item: LibraryItem): item is InternshipExperience {
  return 'company' in item;
}

function experienceLabel(item: LibraryItem): string {
  return isInternshipItem(item) ? `${item.company} · ${item.role}` : `${item.name} · ${item.role}`;
}

/** 结果价值证据启发式判断：句子中含数字/比例/规模等量化信号 */
function hasValueEvidence(sentence: string): boolean {
  return /(\d|%|倍|提升|降低|减少|增长|万|千|亿)/.test(sentence);
}

/**
 * 实习/项目分工权重系数（对应方法论文档第二部分核心结论）：
 * - 实习经历应优先承接 JD 的"工作内容"（responsibilities），证明"我在公司环境中做过类似的事"；
 *   对纯"加分项/技能点"类要求不必强求覆盖，那是项目经历的责任。
 * - 项目经历应优先承接 JD 中"实习未覆盖"的技能、工具和加分项（bonusPoints + toolKeywords），
 *   证明"即使实习没接触，我也有能力把这件事做出来"；对公司职责类要求的权重适当降低。
 * 权重系数不改变总打分公式的 40/30/20/10 结构，而是分别调整"职责类目标"与"加分项类目标"
 * 在 actionScore 汇总时的相对贡献，体现两种经历类型的分工侧重。
 */
const RESPONSIBILITY_WEIGHT = { internship: 1, project: 0.6 };
const BONUS_WEIGHT = { internship: 0.6, project: 1 };

/** 对一条经历计算与 JD 的综合匹配分，并返回可用于叙事的事实片段（分句） */
function scoreExperienceAgainstJD(
  item: LibraryItem,
  analysis: JDAnalysis,
): { score: number; fragments: string[]; matchedRequirements: string[]; usedFragments: string[] } {
  const fragments = splitSentences(item.description);
  const highlightsText = item.highlights.join(' ');
  const toolText = isInternshipItem(item) ? '' : item.techStack.join(' ');
  const wholeText = `${item.role} ${item.description} ${highlightsText} ${toolText}`;

  const kind: 'internship' | 'project' = isInternshipItem(item) ? 'internship' : 'project';

  // 职责类目标（工作内容）与加分项类目标（技能/加分项）分开处理，各自按分工权重折算
  const responsibilityTargets = analysis.responsibilities.map((r) => ({
    rawText: r.rawText,
    coreAction: r.coreAction,
    weight: RESPONSIBILITY_WEIGHT[kind],
  }));
  const bonusTargets = analysis.bonusPoints.map(
    (b) => ({ rawText: b.rawText, coreAction: '加分项匹配', weight: BONUS_WEIGHT[kind] } as Pick<JdResponsibility, 'rawText' | 'coreAction'> & {
      weight: number;
    }),
  );
  const coreTargets = [...responsibilityTargets, ...bonusTargets];

  let actionScore = 0;
  let valueScore = 0;
  const matchedRequirements: string[] = [];
  const usedFragments: string[] = [];

  for (const target of coreTargets) {
    const actionOverlap = textOverlapScore(target.coreAction, wholeText);
    const reqOverlap = textOverlapScore(target.rawText, wholeText);
    const combined = (actionOverlap * 0.6 + reqOverlap * 0.4) * target.weight;
    if (combined >= 0.1) {
      matchedRequirements.push(target.rawText);
      actionScore = Math.max(actionScore, combined);
      // 找出该经历中与该要求最相关的事实片段
      let bestFragment = '';
      let bestFragmentScore = 0;
      for (const frag of fragments) {
        const s = textOverlapScore(target.rawText, frag) + textOverlapScore(target.coreAction, frag);
        if (s > bestFragmentScore) {
          bestFragmentScore = s;
          bestFragment = frag;
        }
      }
      if (bestFragment && !usedFragments.includes(bestFragment)) {
        usedFragments.push(bestFragment);
        if (hasValueEvidence(bestFragment)) valueScore = Math.max(valueScore, 0.8);
      }
    }
  }

  // 场景相似度：业务背景方向关键词与经历文本的重合；
  // 实习更看重与"业务/职场协作"方向的贴合，项目更看重与"技术/方案自主性"方向的贴合，
  // 这里用方向文本重合度作为基础分，两种类型共用同一个相似度信号，差异主要体现在 actionScore 权重上。
  const sceneScore = textOverlapScore(analysis.background.direction, wholeText);

  // 工具重合度：项目经历本身就是"技能补齐"的主战场，工具关键词命中对项目的加成应更明显
  const rawToolOverlap =
    analysis.toolKeywords.length > 0
      ? analysis.toolKeywords.filter((kw) => wholeText.toLowerCase().includes(kw.toLowerCase())).length / analysis.toolKeywords.length
      : 0;
  const toolOverlap = kind === 'project' ? rawToolOverlap : rawToolOverlap * 0.7;

  // 若没有任何片段含量化数据，则用整体经历是否含量化信号兜底
  if (valueScore === 0 && hasValueEvidence(wholeText)) valueScore = 0.4;

  const score = Math.round((actionScore * 0.4 + valueScore * 0.3 + sceneScore * 0.2 + toolOverlap * 0.1) * 100);

  return {
    score: Math.min(100, score),
    fragments,
    matchedRequirements: Array.from(new Set(matchedRequirements)),
    usedFragments: usedFragments.length > 0 ? usedFragments : fragments.slice(0, 2),
  };
}

/**
 * 按实习/项目差异化组织 STAR（对应方法论文档第二部分的核心结论）：
 *
 * - 实习经历回答的是"我已经在公司环境中做过 JD 上写的这类工作"：
 *   S 强调公司业务背景与岗位职责范围；T 强调公司分配的职责和业务目标；
 *   A 除了动作本身，还要体现职场协作行为（沟通、评审、对齐、迭代）；
 *   R 优先业务结果（效率提升、业务方认可、交付物），技术指标作为补充。
 * - 项目经历回答的是"即使实习没接触，我也有能力把这件事做出来"：
 *   S 强调课程/个人兴趣/现实问题背景；T 强调自定义目标或课题目标；
 *   A 强调方案设计、工具选型、技术实现与踩坑迭代过程；
 *   R 优先技术指标、可行性验证、原型效果，其次才是预期业务价值。
 */
function buildStarFromFragments(item: LibraryItem, usedFragments: string[], matchedRequirements: string[]): StarVersion {
  const label = experienceLabel(item);
  const actionText = usedFragments.length > 0 ? usedFragments.join('；') : item.description;
  const valueFragments = usedFragments.filter(hasValueEvidence);
  const requirementText = matchedRequirements.slice(0, 2).join('；');

  if (isInternshipItem(item)) {
    return {
      situation: `在「${item.company}」担任「${item.role}」（${item.period}），处于与目标岗位相关的真实业务环境与职场协作约束中。`,
      task: requirementText
        ? `实习期间承接的职责与目标岗位「${requirementText}」相重合，需要在公司分配的工作范围内完成该任务。`
        : '实习期间承接公司分配的职责，需要在真实业务环境中交付符合岗位要求的工作成果。',
      action: `在职场协作与业务约束下推进：${actionText}（过程中涉及与业务方/团队的沟通对齐、进度同步与方案迭代）。`,
      result:
        valueFragments.length > 0
          ? `业务侧结果：${valueFragments.join('；')}`
          : `${item.highlights.slice(0, 3).join('、') || '业务侧结果待补充'}（暂无明确量化数据，建议补充业务方反馈、交付物或效率提升等结果）`,
    };
  }

  return {
    situation: `在「${label}」（${item.period}）中，面对自主设定或课题/竞赛给定的现实问题背景。`,
    task: requirementText
      ? `自主设定的目标是补齐「${requirementText}」相关的技术能力，独立完成方案探索与实现。`
      : '自主设定技术目标，独立完成方案设计与实现，验证技术可行性。',
    action: `围绕方案设计、工具选型与技术实现展开：${actionText}（过程中包含方案对比、踩坑排查与多轮迭代）。`,
    result:
      valueFragments.length > 0
        ? `技术/验证结果：${valueFragments.join('；')}`
        : `${item.highlights.slice(0, 3).join('、') || '技术指标待补充'}（暂无明确量化数据，建议补充性能指标、可行性验证结论或原型效果）`,
  };
}

/** 单条经历 -> 一份 GeneratedContent（针对当前 JD 包装后的结果） */
function packageExperience(item: LibraryItem, scoreResult: ReturnType<typeof scoreExperienceAgainstJD>): GeneratedContent {
  const label = experienceLabel(item);
  const star = buildStarFromFragments(item, scoreResult.usedFragments, scoreResult.matchedRequirements);

  const resumeLines = [`${label}（${item.period}）`, ...scoreResult.usedFragments.slice(0, 3).map((f) => `· ${f}`)];

  const sentenceEvidenceMap: GeneratedContent['sentenceEvidenceMap'] = scoreResult.usedFragments.map((f) => ({
    sentence: f,
    sourceField: 'description',
    evidenceType: hasValueEvidence(f) ? 'fact_supported' : 'reasonable_rewrite',
  }));

  const riskFlags: string[] = [];
  if (!scoreResult.usedFragments.some(hasValueEvidence)) {
    riskFlags.push('该经历缺少明确的量化结果，建议补充具体数据后再投递，避免夸大表述');
  }
  if (scoreResult.matchedRequirements.length === 0) {
    riskFlags.push('该经历与 JD 核心要求的直接关联较弱，属于兜底推荐，建议谨慎使用');
  }

  return {
    id: genId('gen'),
    sourceExperienceId: item.id,
    sourceExperienceLabel: label,
    matchScore: scoreResult.score,
    matchedRequirements: scoreResult.matchedRequirements,
    usedFactFragments: scoreResult.usedFragments,
    resumeVersion: resumeLines.join('\n'),
    starVersion: star,
    factBasis: [`时间：${item.period}`, `角色：${item.role}`, `来源：${label}`],
    sentenceEvidenceMap,
    usedJdRequirements: scoreResult.matchedRequirements,
    riskFlags,
    savedVersions: [],
    contentSource: 'rule_engine',
    promptVersion: 'rule-engine-v1',
    updatedAt: new Date().toISOString(),
  };
}

export interface RuleGenerationResult {
  recommended: GeneratedContent[];
  unrecommended: UnrecommendedExperience[];
}

const TOP_N = 3;
const MIN_RECOMMEND_SCORE = 15;

/**
 * 智能生成入口：对该类型（实习/项目）下的全部经历打分排序。
 *
 * 筛选策略（重要）：
 * - 当经历总数 <= TOP_N（3）时，说明用户在该类型下本来就没有多少条经历可选，
 *   不应该再做"淘汰"，而是全部保留并逐条按 JD 润色包装，让用户看到每一条经历的改写效果。
 *   这也避免了「淘汰导致历史版本被清空」的连带问题：经历数量少时根本不会触发淘汰，
 *   用户此前对某条经历保存的历史版本不会因为重新生成而被移出推荐列表。
 * - 只有当经历总数 > TOP_N 时，才需要真正做"二选一"式的筛选，此时取 Top 2-3 分别包装，
 *   其余给出未推荐原因（供用户了解为什么没被选中，而不是静默丢弃）。
 */
export function ruleGenerateContent(kind: 'internship' | 'project', task: JobTask, library: ExperienceLibrary): RuleGenerationResult {
  const items: LibraryItem[] = kind === 'internship' ? library.internships : library.projects;

  if (items.length === 0 || !task.jdAnalysis) {
    return { recommended: [], unrecommended: [] };
  }

  const analysis = task.jdAnalysis;
  const scored = items.map((item) => ({ item, result: scoreExperienceAgainstJD(item, analysis) }));
  scored.sort((a, b) => b.result.score - a.result.score);

  // 经历总数不超过 Top N 时：全部保留并润色，不做淘汰
  if (items.length <= TOP_N) {
    const recommended = scored.map((s) => packageExperience(s.item, s.result));
    return { recommended, unrecommended: [] };
  }

  const picked = scored.slice(0, TOP_N).filter((s) => s.result.score >= MIN_RECOMMEND_SCORE);
  // 若打分都很低，至少保留匹配度最高的 1 条，避免用户完全无内容可看，但会带风险提示
  const finalPicked = picked.length > 0 ? picked : scored.slice(0, 1);
  const pickedIds = new Set(finalPicked.map((s) => s.item.id));

  const recommended = finalPicked.map((s) => packageExperience(s.item, s.result));

  const unrecommended: UnrecommendedExperience[] = scored
    .filter((s) => !pickedIds.has(s.item.id))
    .map((s) => ({
      experienceId: s.item.id,
      experienceLabel: experienceLabel(s.item),
      matchScore: s.result.score,
      reason:
        s.result.matchedRequirements.length === 0
          ? '未发现与 JD 核心要求相关的动作或结果证据，方向关联较弱'
          : '与 Top 经历相比匹配度较低，核心动作或结果证据不如其他经历充分',
    }));

  return { recommended, unrecommended };
}
