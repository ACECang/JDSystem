/**
 * 数据访问层：基于浏览器 localStorage 实现。
 *
 * 对外保持统一的异步方法签名，业务组件无需关心底层存储。
 * 若日后需要接回真实后端，只需替换本文件内部实现。
 *
 * 说明：
 * - 所有方法均为异步（返回 Promise），上层组件使用 async/await 调用；
 * - localStorage 是同步存储，不存在异步后端的并发写入竞态，
 *   「保存历史版本」等连续写入操作天然是原子的。
 */

import type {
  AppData,
  ExperienceLibrary,
  FavoriteSite,
  GeneratedContent,
  InternshipExperience,
  JDAnalysis,
  JobTask,
  MatchItem,
  ModelProfile,
  ModelSettings,
  ProjectExperience,
  SkillItem,
  UnrecommendedExperience,
} from '@/types';
import { DEFAULT_PROMPT_TEMPLATES, resolvePromptTemplates } from '@/lib/llm/promptSchemas';

const STORAGE_KEY = 'jdsystem:app-data:v1';
const LOG_KEY = 'jdsystem:llm-call-logs:v1';
const SETTINGS_USER_SAVED_KEY = 'jdsystem:settings-user-saved:v1';
const MAX_LOGS = 200;

// ==================== 预置模型配置 ====================

/** 未做任何预置时的兜底值，同时也是设置弹框里的占位默认值。 */
const FALLBACK_API_URL = 'https://open.bigmodel.cn/api/paas/v4';
const FALLBACK_TEXT_MODEL = 'glm-4.7-flash';
const FALLBACK_VISION_MODEL = 'glm-4.6v-flash';

/**
 * 从项目根目录的 .env.local 读取预置配置，省掉每次打开都要重填一遍的麻烦。
 * 该文件已被 .gitignore 的 `*.local` 规则忽略，不会进版本库。
 * 不填也不影响使用，只是退回规则引擎。
 */
function envStr(
  key:
    | 'VITE_DEFAULT_API_URL'
    | 'VITE_DEFAULT_API_KEY'
    | 'VITE_DEFAULT_TEXT_MODEL'
    | 'VITE_DEFAULT_VISION_MODEL',
): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

const PRESET_API_URL = envStr('VITE_DEFAULT_API_URL') || FALLBACK_API_URL;
const PRESET_API_KEY = envStr('VITE_DEFAULT_API_KEY');
const PRESET_TEXT_MODEL = envStr('VITE_DEFAULT_TEXT_MODEL') || FALLBACK_TEXT_MODEL;
const PRESET_VISION_MODEL = envStr('VITE_DEFAULT_VISION_MODEL') || FALLBACK_VISION_MODEL;
/** 只有真的配了 Key 才默认启用大模型，否则保持规则引擎降级路径。 */
const HAS_PRESET = Boolean(PRESET_API_KEY);

/** 内置默认配置：始终存在、不可删除/重命名，默认即「默认（智谱）」。 */
const DEFAULT_PROFILE_ID = 'default';
const DEFAULT_PROFILE_NAME = '默认（智谱）';

function makeDefaultProfile(): ModelProfile {
  return {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    builtin: true,
    settings: structuredClone(DEFAULT_MODEL_SETTINGS),
  };
}

/**
 * 用户是否曾在「模型设置」弹框主动点过「保存」。
 * 这个标记决定兜底策略：未保存过 → 持续用预置值（打开即 AI 模式）；
 * 保存过 → 完全尊重用户选择（即使他清空 key 换回规则引擎也不被覆盖）。
 */
function userHasSavedSettings(): boolean {
  try {
    return localStorage.getItem(SETTINGS_USER_SAVED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSettingsUserSaved(): void {
  try {
    localStorage.setItem(SETTINGS_USER_SAVED_KEY, '1');
  } catch {
    // 隐私模式下 localStorage 可能不可写，忽略即可，不影响主流程
  }
}

/** 供「模型设置」弹框在用户主动保存后调用，停止预置值兜底、尊重用户选择。 */
export function markModelSettingsUserSaved(): void {
  markSettingsUserSaved();
}

export function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  apiUrl: PRESET_API_URL,
  apiKey: PRESET_API_KEY,
  textModel: PRESET_TEXT_MODEL,
  visionModel: PRESET_VISION_MODEL,
  useLlm: HAS_PRESET,
  prompts: { ...DEFAULT_PROMPT_TEMPLATES },
};

export const DEFAULT_APP_DATA: AppData = {
  tasks: [],
  experienceLibrary: { internships: [], projects: [], skills: [] },
  favoriteSites: [],
  modelSettings: { ...DEFAULT_MODEL_SETTINGS },
  modelProfiles: [makeDefaultProfile()],
  activeProfileId: DEFAULT_PROFILE_ID,
};

/** 单个配置归一化：补齐字段、内置配置锁定名称。 */
function normalizeProfile(raw: any): ModelProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : genId('prof');
  const builtin = raw.builtin === true || id === DEFAULT_PROFILE_ID;
  const name = builtin
    ? DEFAULT_PROFILE_NAME
    : typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : '未命名配置';
  return { id, name, builtin: builtin ? true : undefined, settings: normalizeModelSettings(raw.settings) };
}

/**
 * 把存储数据解析为「配置列表 + 激活 id」。
 * 兼容旧版本：若没有 modelProfiles（早期只有单套 modelSettings），
 * 则把单套设置迁移成列表——内置「默认（智谱）」+（用户曾保存过则追加）「我的配置」。
 */
function resolveProfiles(parsed: any): { profiles: ModelProfile[]; activeId: string } {
  if (Array.isArray(parsed?.modelProfiles) && parsed.modelProfiles.length) {
    const profiles = parsed.modelProfiles.map(normalizeProfile).filter(Boolean) as ModelProfile[];
    if (profiles.length) {
      const activeId = profiles.some((p) => p.id === parsed.activeProfileId)
        ? parsed.activeProfileId
        : profiles[0].id;
      return { profiles, activeId };
    }
  }
  // 旧版本迁移
  const legacy = normalizeModelSettings(parsed?.modelSettings);
  const profiles = [makeDefaultProfile()];
  let activeId = DEFAULT_PROFILE_ID;
  if (userHasSavedSettings()) {
    // 曾主动保存过自定义配置 → 作为首个用户配置保留，避免丢失已有的 key/模型
    const p: ModelProfile = { id: genId('prof'), name: '我的配置', settings: legacy };
    profiles.push(p);
    activeId = p.id;
  }
  return { profiles, activeId };
}

/**
 * 模型设置归一化 + 旧版本数据迁移。
 * 早期版本只存了单个 modelName 字段，升级为「文本模型 + 视觉模型」后，
 * 这里把旧值迁移到 textModel，避免用户已填好的配置在升级后丢失。
 */
function normalizeModelSettings(raw: any): ModelSettings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_MODEL_SETTINGS);

  // 兜底策略：只有用户从未在「模型设置」弹框主动点过「保存」时，
  // 才用预置值（来自 .env.local）覆盖空字段，保证「打开即 AI 模式」。
  // 一旦用户主动保存过（哪怕清空 key 换回规则引擎），就完全尊重其选择。
  const usePreset = HAS_PRESET && !userHasSavedSettings();

  const take = (value: unknown, preset: string): string => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return usePreset ? preset : '';
  };

  return {
    apiUrl: take(raw.apiUrl, PRESET_API_URL),
    apiKey: take(raw.apiKey, PRESET_API_KEY),
    // 早期版本只存了单个 modelName 字段，升级为「文本模型 + 视觉模型」后迁移到 textModel
    textModel: take(raw.textModel ?? raw.modelName, PRESET_TEXT_MODEL),
    visionModel: take(raw.visionModel, PRESET_VISION_MODEL),
    // 未主动保存过 → 直接看预置有没有 key；保存过 → 尊重用户的 useLlm
    useLlm: userHasSavedSettings() ? Boolean(raw.useLlm) : HAS_PRESET,
    prompts: resolvePromptTemplates(raw.prompts),
  };
}

// ==================== 存储读写 ====================

function normalizeTask(raw: any): JobTask {
  return {
    id: String(raw?.id ?? genId('task')),
    title: raw?.title ?? '',
    company: raw?.company ?? '',
    status: raw?.status ?? 'pending',
    createdAt: raw?.createdAt ?? nowISO(),
    updatedAt: raw?.updatedAt ?? nowISO(),
    jdText: raw?.jdText ?? '',
    jdAnalysis: raw?.jdAnalysis ?? null,
    matchItems: Array.isArray(raw?.matchItems) ? raw.matchItems : [],
    matchSource: raw?.matchSource ?? undefined,
    matchReason: raw?.matchReason ?? undefined,
    internshipContents: Array.isArray(raw?.internshipContents) ? raw.internshipContents : [],
    projectContents: Array.isArray(raw?.projectContents) ? raw.projectContents : [],
    unrecommendedInternships: Array.isArray(raw?.unrecommendedInternships) ? raw.unrecommendedInternships : [],
    unrecommendedProjects: Array.isArray(raw?.unrecommendedProjects) ? raw.unrecommendedProjects : [],
  };
}

/** 读取并补全存储中的数据，缺失字段一律回填默认值，避免旧数据或半损数据导致渲染崩溃 */
function readStore(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_APP_DATA);
    const parsed = JSON.parse(raw);
    const { profiles, activeId } = resolveProfiles(parsed);
    const active = profiles.find((p) => p.id === activeId) || profiles[0];
    return {
      tasks: Array.isArray(parsed?.tasks) ? parsed.tasks.map(normalizeTask) : [],
      experienceLibrary: {
        internships: Array.isArray(parsed?.experienceLibrary?.internships) ? parsed.experienceLibrary.internships : [],
        projects: Array.isArray(parsed?.experienceLibrary?.projects) ? parsed.experienceLibrary.projects : [],
        skills: Array.isArray(parsed?.experienceLibrary?.skills) ? parsed.experienceLibrary.skills : [],
      },
      favoriteSites: Array.isArray(parsed?.favoriteSites) ? parsed.favoriteSites : [],
      // modelSettings 为派生值：始终等于当前激活配置的 settings
      modelSettings: active.settings,
      modelProfiles: profiles,
      activeProfileId: active.id,
    };
  } catch {
    return structuredClone(DEFAULT_APP_DATA);
  }
}

function writeStore(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    // 最常见于 JD 截图以 dataURL 形式存入导致超出 5MB 配额
    throw new Error(
      `本地存储写入失败（可能已超出浏览器配额，建议移除 JD 截图后重试）：${(err as Error).message}`,
    );
  }
}

/** 读-改-写：localStorage 同步完成，不存在异步竞态 */
function mutate<T>(fn: (data: AppData) => T): T {
  const data = readStore();
  const result = fn(data);
  writeStore(data);
  return result;
}

// ==================== 任务 ====================

async function getTasks(): Promise<JobTask[]> {
  return readStore().tasks;
}

async function addTask(task: Omit<JobTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<JobTask> {
  const now = nowISO();
  const created: JobTask = normalizeTask({
    ...task,
    id: genId('task'),
    jdText: task.jdText || '',
    matchItems: task.matchItems || [],
    internshipContents: task.internshipContents || [],
    projectContents: task.projectContents || [],
    unrecommendedInternships: task.unrecommendedInternships || [],
    unrecommendedProjects: task.unrecommendedProjects || [],
    createdAt: now,
    updatedAt: now,
  });
  mutate((d) => {
    d.tasks.unshift(created);
  });
  return created;
}

async function updateTask(id: string, patch: Partial<JobTask>): Promise<void> {
  mutate((d) => {
    const idx = d.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    d.tasks[idx] = { ...d.tasks[idx], ...patch, updatedAt: nowISO() };
  });
}

async function deleteTask(id: string): Promise<void> {
  mutate((d) => {
    d.tasks = d.tasks.filter((t) => t.id !== id);
  });
}

// ==================== 任务内的结构化结果（供内部复用，语义与原实现一致） ====================

async function loadJdAnalysis(taskId: string): Promise<JDAnalysis | null> {
  return readStore().tasks.find((t) => t.id === taskId)?.jdAnalysis ?? null;
}

async function saveJdAnalysis(taskId: string, analysis: JDAnalysis): Promise<void> {
  await updateTask(taskId, { jdAnalysis: analysis });
}

async function loadMatchItems(taskId: string): Promise<MatchItem[]> {
  return readStore().tasks.find((t) => t.id === taskId)?.matchItems ?? [];
}

async function saveMatchItems(taskId: string, items: MatchItem[]): Promise<void> {
  await updateTask(taskId, { matchItems: items });
}

async function loadGeneratedContents(taskId: string, kind: 'internship' | 'project'): Promise<GeneratedContent[]> {
  const task = readStore().tasks.find((t) => t.id === taskId);
  if (!task) return [];
  return kind === 'internship' ? task.internshipContents : task.projectContents;
}

async function saveGeneratedContents(
  taskId: string,
  kind: 'internship' | 'project',
  contents: GeneratedContent[],
): Promise<void> {
  await updateTask(taskId, kind === 'internship' ? { internshipContents: contents } : { projectContents: contents });
}

async function loadUnrecommended(taskId: string, kind: 'internship' | 'project'): Promise<UnrecommendedExperience[]> {
  const task = readStore().tasks.find((t) => t.id === taskId);
  if (!task) return [];
  return kind === 'internship' ? task.unrecommendedInternships : task.unrecommendedProjects;
}

async function saveUnrecommended(
  taskId: string,
  kind: 'internship' | 'project',
  list: UnrecommendedExperience[],
): Promise<void> {
  await updateTask(
    taskId,
    kind === 'internship' ? { unrecommendedInternships: list } : { unrecommendedProjects: list },
  );
}

// ==================== 经历库 ====================

async function getExperienceLibrary(): Promise<ExperienceLibrary> {
  return readStore().experienceLibrary;
}

async function addInternship(item: Omit<InternshipExperience, 'id' | 'createdAt'>): Promise<InternshipExperience> {
  const created: InternshipExperience = {
    ...item,
    highlights: item.highlights || [],
    id: genId('internship'),
    createdAt: nowISO(),
  };
  mutate((d) => {
    d.experienceLibrary.internships.unshift(created);
  });
  return created;
}

async function deleteInternship(id: string): Promise<void> {
  mutate((d) => {
    d.experienceLibrary.internships = d.experienceLibrary.internships.filter((i) => i.id !== id);
  });
}

async function addProject(item: Omit<ProjectExperience, 'id' | 'createdAt'>): Promise<ProjectExperience> {
  const created: ProjectExperience = {
    ...item,
    techStack: item.techStack || [],
    highlights: item.highlights || [],
    id: genId('project'),
    createdAt: nowISO(),
  };
  mutate((d) => {
    d.experienceLibrary.projects.unshift(created);
  });
  return created;
}

async function deleteProject(id: string): Promise<void> {
  mutate((d) => {
    d.experienceLibrary.projects = d.experienceLibrary.projects.filter((p) => p.id !== id);
  });
}

async function addSkill(item: Omit<SkillItem, 'id' | 'createdAt'>): Promise<SkillItem> {
  const created: SkillItem = { ...item, id: genId('skill'), createdAt: nowISO() };
  mutate((d) => {
    d.experienceLibrary.skills.unshift(created);
  });
  return created;
}

async function deleteSkill(id: string): Promise<void> {
  mutate((d) => {
    d.experienceLibrary.skills = d.experienceLibrary.skills.filter((s) => s.id !== id);
  });
}

// ==================== 常用网站收藏 ====================

async function getFavoriteSites(): Promise<FavoriteSite[]> {
  return readStore().favoriteSites;
}

async function addFavoriteSite(
  item: Omit<FavoriteSite, 'id' | 'createdAt' | 'pinned'>,
): Promise<FavoriteSite> {
  const created: FavoriteSite = { ...item, id: genId('site'), pinned: false, createdAt: nowISO() };
  mutate((d) => {
    d.favoriteSites.unshift(created);
  });
  return created;
}

async function toggleFavoriteSitePin(id: string): Promise<void> {
  mutate((d) => {
    const site = d.favoriteSites.find((s) => s.id === id);
    if (site) site.pinned = !site.pinned;
  });
}

async function deleteFavoriteSite(id: string): Promise<void> {
  mutate((d) => {
    d.favoriteSites = d.favoriteSites.filter((s) => s.id !== id);
  });
}

// ==================== 模型配置列表 ====================

/** 读取当前激活配置（派生，等于 activeProfile 的 settings）。 */
async function getModelSettings(): Promise<ModelSettings> {
  return readStore().modelSettings;
}

async function getModelProfiles(): Promise<ModelProfile[]> {
  return readStore().modelProfiles;
}

async function getActiveProfileId(): Promise<string> {
  return readStore().activeProfileId;
}

/** 切换当前激活配置：仅改变 activeProfileId，并把派生 modelSettings 指过去。 */
async function setActiveProfile(id: string): Promise<void> {
  mutate((d) => {
    const p = d.modelProfiles.find((x) => x.id === id);
    if (!p) return;
    d.activeProfileId = id;
    d.modelSettings = p.settings;
  });
}

/** 把表单内容保存进「当前激活配置」（覆盖其 settings）。 */
async function saveActiveProfileSettings(settings: ModelSettings): Promise<void> {
  mutate((d) => {
    const p = d.modelProfiles.find((x) => x.id === d.activeProfileId);
    if (!p) return;
    p.settings = { ...settings };
    d.modelSettings = p.settings;
  });
}

/** 另存为新配置：创建一套带名字的配置并立即激活它。返回新配置 id。 */
async function saveNewProfile(name: string, settings: ModelSettings): Promise<string> {
  const id = genId('prof');
  mutate((d) => {
    d.modelProfiles.push({ id, name: name.trim() || '未命名配置', settings: { ...settings } });
    d.activeProfileId = id;
    d.modelSettings = settings;
  });
  return id;
}

/** 删除用户配置（内置「默认（智谱）」不可删）；若删的是激活项则回退到默认。 */
async function deleteModelProfile(id: string): Promise<void> {
  mutate((d) => {
    const p = d.modelProfiles.find((x) => x.id === id);
    if (!p || p.builtin) return;
    d.modelProfiles = d.modelProfiles.filter((x) => x.id !== id);
    if (d.activeProfileId === id) {
      d.activeProfileId = DEFAULT_PROFILE_ID;
      const def = d.modelProfiles.find((x) => x.id === DEFAULT_PROFILE_ID);
      if (def) d.modelSettings = def.settings;
    }
  });
}

/** 重命名用户配置（内置配置不可改名）。 */
async function renameModelProfile(id: string, name: string): Promise<void> {
  mutate((d) => {
    const p = d.modelProfiles.find((x) => x.id === id);
    if (!p || p.builtin) return;
    const n = name.trim();
    if (n) p.name = n;
  });
}

// ==================== 汇总读取 ====================

async function getAll(): Promise<AppData> {
  return readStore();
}

// ==================== LLM 调用审计日志 ====================

/** 日志存放在独立的 key 中，避免与主数据互相挤占配额；失败静默忽略，不影响主流程 */
async function logLlmCall(log: {
  taskId?: string;
  nodeType: string;
  promptVersion?: string;
  requestPayload: unknown;
  responsePayload: unknown;
  status: 'success' | 'error';
  errorMessage?: string;
  durationMs: number;
}): Promise<void> {
  try {
    const entry = { ...log, createdAt: nowISO() };
    const raw = localStorage.getItem(LOG_KEY);
    const logs = raw ? JSON.parse(raw) : [];
    logs.unshift(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
  } catch {
    // 审计日志失败不影响主流程
  }
}

/** 读取调用日志，供调试与效果评估使用（原实现未暴露，此处补充） */
async function getLlmCallLogs(): Promise<unknown[]> {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const db = {
  genId,
  nowISO,
  getAll,
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  getExperienceLibrary,
  addInternship,
  deleteInternship,
  addProject,
  deleteProject,
  addSkill,
  deleteSkill,
  getFavoriteSites,
  addFavoriteSite,
  toggleFavoriteSitePin,
  deleteFavoriteSite,
  getModelSettings,
  getModelProfiles,
  getActiveProfileId,
  setActiveProfile,
  saveActiveProfileSettings,
  saveNewProfile,
  deleteModelProfile,
  renameModelProfile,
  logLlmCall,
  getLlmCallLogs,
  loadGeneratedContents,
  saveGeneratedContents,
  loadUnrecommended,
  saveUnrecommended,
  loadJdAnalysis,
  saveJdAnalysis,
  loadMatchItems,
  saveMatchItems,
};
