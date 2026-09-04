// ==================== 基础类型 ====================

/** 任务状态枚举 */
export type TaskStatus =
  | 'pending' // 待分析
  | 'generated' // 已生成
  | 'ready' // 待投递
  | 'delivered' // 已投递
  | 'interviewing' // 面试中
  | 'offer' // Offer
  | 'rejected'; // 已挂

export const TASK_STATUS_LIST: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'pending', label: '待分析', color: 'gray' },
  { value: 'generated', label: '已生成', color: 'blue' },
  { value: 'ready', label: '待投递', color: 'teal' },
  { value: 'delivered', label: '已投递', color: 'orange' },
  { value: 'interviewing', label: '面试中', color: 'purple' },
  { value: 'offer', label: 'Offer', color: 'green' },
  { value: 'rejected', label: '已挂', color: 'red' },
];

/** 内容来源：免费规则引擎 或 大模型 */
export type ContentSource = 'rule_engine' | 'llm';

// ==================== JD 解析结果（节点①输出协议） ====================

/** 工作内容：四层拆解（核心动作 -> 背后能力 -> 证据类型 -> 提取提示） */
export interface JdResponsibility {
  id: string;
  rawText: string; // JD 原句
  coreAction: string; // 核心动作，如：业务调研、流程梳理
  requiredCapability: string; // 背后能力，如：与业务方沟通、主动发现问题
  evidenceType: string; // 需要的证据类型，如：访谈记录、流程优化案例
  extractionHint: string; // 去经历中找什么
  priority: 'core' | 'secondary'; // 核心 / 次要
}

/** 硬性门槛：仅用于筛选，不参与匹配 */
export interface JdHardRequirement {
  id: string;
  rawText: string;
}

/** 软性素质：原句 + 行为翻译，禁止直接使用抽象形容词 */
export interface JdSoftSkill {
  id: string;
  rawText: string; // 原始抽象描述，如：高同理心
  behaviorTranslation: string; // 翻译后的客观行为要求
  extractionHint: string; // 去经历中找什么类型的行为片段
}

/** 加分项 */
export interface JdBonusPoint {
  id: string;
  rawText: string;
  extractionHint: string;
}

/** 业务背景与方向判断（用于负向筛选） */
export interface JdBackground {
  rawSentences: string[]; // 业务背景原句
  direction: string; // 方向判断，如：业务落地导向 / 技术深度导向
  negativeSignals: string[]; // 负向信号，如：不做纯理论调研
}

/** JD 解析结果（完整协议） */
export interface JDAnalysis {
  background: JdBackground;
  responsibilities: JdResponsibility[];
  hardRequirements: JdHardRequirement[];
  softSkills: JdSoftSkill[];
  bonusPoints: JdBonusPoint[];
  toolKeywords: string[]; // 识别出的工具/平台/技术栈名词（配角，非能力证据本身）
  negativeFilterList: string[]; // 不建议作为主线的经历类型
  analysisSource: ContentSource;
  promptVersion?: string;
  /** 规则引擎生成原因：仅在「本应调大模型但失败、自动降级」时填写（如 429 限流）；规则引擎模式下为空 */
  ruleReason?: string;
}

// ==================== JD 匹配结果（节点②输出协议） ====================

export type MatchLevel = 'strong' | 'partial' | 'weak' | 'no_evidence';

export type MatchedExperienceType = 'internship' | 'project' | null;

/** JD 要求 -> 经历证据 匹配项 */
export interface MatchItem {
  id: string;
  requirement: string; // JD 要求原句
  coreActionRequired: string; // 对应 JD 解析节点的 core_action
  matchedExperienceType: MatchedExperienceType;
  matchedExperienceId?: string; // 关联的经历 id
  matchedAction: string; // 该经历中实际发生的核心动作
  valueEvidence: string; // 该经历体现的价值/结果，无则为空字符串
  evidence: string; // 证据描述文本
  matchLevel: MatchLevel;
  matchReason: string; // 判定理由
  missingInfo: string; // 若证据不完整，需要补充的信息
  riskOfOverclaim: string; // 夸大风险提示
}

// ==================== 生成内容（节点③④输出协议） ====================

/** 句子级事实溯源 */
export interface SentenceEvidence {
  sentence: string;
  sourceField: string; // 来自哪条原始经历字段
  evidenceType: 'fact_supported' | 'reasonable_rewrite' | 'needs_confirmation';
}

export interface StarVersion {
  situation: string;
  task: string;
  action: string;
  result: string;
}

/** 生成内容：简历版 + STAR 版 + 事实依据 + 句子级溯源
 *
 * 一份 GeneratedContent 对应「一条原始经历，针对当前 JD 改写包装后」的结果。
 * 同一类型（实习/项目）下可以同时存在多份（Top 2-3 推荐），彼此独立编辑、独立保存历史版本。
 */
export interface GeneratedContent {
  id: string; // 唯一标识这一份生成结果
  sourceExperienceId: string; // 基于经历库中哪一条原始经历生成
  sourceExperienceLabel: string; // 该经历的展示名称，如「美团点评 · 后端开发实习生」
  matchScore: number; // 该经历相对当前 JD 的综合推荐分（0-100），用于排序
  matchedRequirements: string[]; // 主要命中了 JD 的哪些要求（用于卡片摘要展示）
  usedFactFragments: string[]; // 从原始经历中提取并使用的事实片段（未被使用的片段即被主动省略）

  resumeVersion: string; // 简历版（精炼要点，动词开头）
  starVersion: StarVersion; // STAR 版（情境-任务-行动-结果）
  factBasis: string[]; // 事实依据标签
  sentenceEvidenceMap: SentenceEvidence[]; // 句子级事实溯源
  usedJdRequirements: string[]; // 使用了哪些 JD 要求
  riskFlags: string[]; // 夸大/推断风险提示
  savedVersions: SavedVersion[]; // 保存的历史版本，重新生成时不会被清空
  contentSource: ContentSource;
  promptVersion?: string;
  updatedAt: string;
  /** 规则引擎生成原因（降级时填写）；规则引擎模式下为空 */
  ruleReason?: string;
}

/** 未被推荐的经历：告知用户「为什么没选它」，而不是静默丢弃 */
export interface UnrecommendedExperience {
  experienceId: string;
  experienceLabel: string;
  matchScore: number;
  reason: string; // 未推荐原因，如「仅工具重合，缺少能力动作与结果证据」
}

export interface SavedVersion {
  id: string;
  resumeVersion: string;
  starVersion: string; // 存储为拼接后的展示文本，便于历史回看
  factBasis: string[];
  savedAt: string;
  note?: string;
}

/** 岗位任务（左栏列表项） */
export interface JobTask {
  id: string;
  title: string; // 岗位/公司名称
  company: string;
  status: TaskStatus;
  createdAt: string; // ISO 日期，用于日期分组
  updatedAt: string;

  /**
   * JD 输入。
   * 图片不再落库：截图仅存在于组件本地状态，由 InputRouter 转成文字后即丢弃，
   * 避免 base64 撑爆 localStorage 配额（旧版本的 jdImageUrl / jdLink 字段已废弃）。
   */
  jdText: string;

  // JD 解析结果
  jdAnalysis: JDAnalysis | null;

  // 匹配表
  matchItems: MatchItem[];
  // 匹配表来源与降级原因（用于 UI 提示"哪部分是规则引擎生成"）
  matchSource?: ContentSource;
  matchReason?: string;

  // 实习 / 项目经历各自独立的推荐结果列表（按 matchScore 从高到低排序，最多 2-3 条）
  internshipContents: GeneratedContent[];
  projectContents: GeneratedContent[];
  // 未被选中的经历及原因，实习、项目分别统计
  unrecommendedInternships: UnrecommendedExperience[];
  unrecommendedProjects: UnrecommendedExperience[];
}

// ==================== 个人资料库 ====================

export interface InternshipExperience {
  id: string;
  company: string;
  role: string;
  period: string; // 如 2023.07 - 2023.09
  description: string; // 详细描述（STAR 或流水账均可）
  highlights: string[]; // 关键亮点标签
  createdAt: string;
}

export interface ProjectExperience {
  id: string;
  name: string;
  role: string;
  period: string;
  description: string;
  techStack: string[];
  highlights: string[];
  createdAt: string;
}

export interface SkillItem {
  id: string;
  name: string;
  category: string; // 分类：编程语言/工具/软技能等
  level: 'basic' | 'proficient' | 'expert'; // 了解/熟练/精通
  createdAt: string;
}

export interface ExperienceLibrary {
  internships: InternshipExperience[];
  projects: ProjectExperience[];
  skills: SkillItem[];
}

// ==================== 常用网站收藏 ====================

export interface FavoriteSite {
  id: string;
  name: string;
  url: string;
  pinned: boolean;
  createdAt: string;
}

// ==================== 模型设置 ====================

/**
 * 可编辑的 Prompt 模板集合。
 *
 * coreRules 是公共前缀，会被注入到其余三个节点的模板中（模板内以 ${coreRules} 占位），
 * 因此改 coreRules 会同时影响全部生成节点——这正是"方法论约束统一维护"的语义。
 * visionExtraction 是图片理解模块专用的固定 prompt，不参与 coreRules 注入。
 */
export interface PromptTemplates {
  coreRules: string;
  jdAnalysis: string;
  jdMatching: string;
  generation: string;
  visionExtraction: string;
}

export interface ModelSettings {
  apiUrl: string; // Base URL，系统自动拼接 /chat/completions
  apiKey: string;
  /** 文本生成模型（如 glm-4.7-flash）：所有生成任务的唯一出口 */
  textModel: string;
  /** 视觉理解模型（如 glm-4.6v-flash）：只做图片内容提取，不参与任何生成 */
  visionModel: string;
  useLlm: boolean; // 是否启用大模型（关闭则强制走免费规则引擎）
  /** Prompt 模板，可在「模型设置」中编辑并恢复默认 */
  prompts: PromptTemplates;
}

/**
 * 一套命名模型配置。系统支持保存多套，下拉切换。
 * builtin 为 true 的「默认（智谱）」内置配置不可删除、不可重命名。
 */
export interface ModelProfile {
  id: string;
  /** 用户可见名称；内置配置固定为「默认（智谱）」 */
  name: string;
  /** 是否为内置默认配置（id === 'default'），内置配置不可删除/重命名 */
  builtin?: boolean;
  settings: ModelSettings;
}

// ==================== 应用全局数据 ====================

export interface AppData {
  tasks: JobTask[];
  experienceLibrary: ExperienceLibrary;
  favoriteSites: FavoriteSite[];
  /** 派生值：当前激活配置（activeProfileId 指向的那套）的 settings，供业务直接读取 */
  modelSettings: ModelSettings;
  /** 已保存的模型配置列表（含内置「默认（智谱）」） */
  modelProfiles: ModelProfile[];
  /** 当前激活的配置 id */
  activeProfileId: string;
}

// ==================== LLM 节点协议（供 provider/ruleEngine 共用） ====================

export type LlmNodeType = 'jd_analysis' | 'jd_matching' | 'internship_generation' | 'project_generation';

export interface LlmCallLog {
  taskId?: string;
  nodeType: LlmNodeType;
  promptVersion?: string;
  requestPayload: unknown;
  responsePayload: unknown;
  status: 'success' | 'error';
  errorMessage?: string;
  durationMs: number;
}
