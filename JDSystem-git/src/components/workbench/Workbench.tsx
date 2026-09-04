import { useEffect, useMemo, useState } from 'react';
import { Button, Icon, message, Row, Col, Select } from '@/vendor/mtd-react3';
import type { AppData, ContentSource, JobTask, SavedVersion, TaskStatus } from '@/types';
import { TASK_STATUS_LIST } from '@/types';
import { db, DEFAULT_APP_DATA } from '@/lib/db';
import { seedIfEmpty } from '@/lib/seedData';
import { analyzeJD, generateContent, matchExperience } from '@/lib/llm/provider';

import TaskListPanel from './TaskListPanel';
import JdInputCard from './JdInputCard';
import JdAnalysisCard from './JdAnalysisCard';
import MatchTableCard from './MatchTableCard';
import GeneratedContentCard from './GeneratedContentCard';
import ExperienceLibraryPanel from './ExperienceLibraryPanel';
import FavoriteSitesPanel from './FavoriteSitesPanel';
import AddTaskModal from './AddTaskModal';
import AddExperienceModal, { type AddExperienceType } from './AddExperienceModal';
import ModelSettingsModal from './ModelSettingsModal';

export default function Workbench() {
  const [appData, setAppData] = useState<AppData>(DEFAULT_APP_DATA);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addExperienceType, setAddExperienceType] = useState<AddExperienceType>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState<'internship' | 'project' | null>(null);

  const refresh = async () => {
    const data = await db.getAll();
    setAppData(data);
  };

  /** 切换激活的模型配置（立即系统级生效） */
  const handleSelectProfile = async (id: string) => {
    await db.setActiveProfile(id);
    await refresh();
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await seedIfEmpty();
        await refresh();
      } catch {
        message.error({ message: '数据加载失败，请检查数据库连接' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeTaskId && appData.tasks.length > 0) {
      setActiveTaskId(appData.tasks[0].id);
    }
  }, [appData.tasks, activeTaskId]);

  const activeTask = useMemo(
    () => appData.tasks.find((t) => t.id === activeTaskId) || null,
    [appData.tasks, activeTaskId],
  );

  // ---------- 任务相关 ----------
  const handleAddTask = async (data: { title: string; company: string }) => {
    const newTask = await db.addTask({
      title: data.title,
      company: data.company,
      status: 'pending',
      jdText: '',
      jdAnalysis: null,
      matchItems: [],
      internshipContents: [],
      projectContents: [],
      unrecommendedInternships: [],
      unrecommendedProjects: [],
    });
    await refresh();
    setActiveTaskId(newTask.id);
    setAddTaskOpen(false);
  };

  const handleDeleteTask = async (id: string) => {
    await db.deleteTask(id);
    await refresh();
    if (activeTaskId === id) {
      setActiveTaskId(null);
    }
  };

  const handleTaskChange = async (patch: Partial<JobTask>) => {
    if (!activeTask) return;
    await db.updateTask(activeTask.id, patch);
    await refresh();
  };

  const handleChangeStatus = async (status: TaskStatus) => {
    if (!activeTask) return;
    await db.updateTask(activeTask.id, { status });
    await refresh();
    message.success({ message: `状态已更新为「${TASK_STATUS_LIST.find((s) => s.value === status)?.label}」` });
  };

  /**
   * jdTextOverride：由 JD 输入区传入的已归一化文本。
   * 上传图片时，图片要先经 InputRouter 转成文字，而这一步的结果还没来得及走完
   * 「写库 → refresh → 更新 appData」的链路，此时 activeTask.jdText 仍是旧值，
   * 因此这里优先使用调用方显式传入的归一化结果。
   */
  const handleAnalyze = async (jdTextOverride?: string) => {
    if (!activeTask) return;
    const jdText = (jdTextOverride ?? activeTask.jdText).trim();
    if (!jdText) {
      message.error({ message: '请先粘贴 JD 文本，或上传 JD 截图自动识别' });
      return;
    }
    setAnalyzing(true);
    try {
      const { data: analysis, log: analysisLog } = await analyzeJD(jdText, appData.modelSettings, activeTask.id);
      void db.logLlmCall(analysisLog);

      const { data: matchItems, log: matchLog } = await matchExperience(
        analysis,
        appData.experienceLibrary,
        appData.modelSettings,
        activeTask.id,
      );
      void db.logLlmCall(matchLog);

      await db.updateTask(activeTask.id, {
        jdAnalysis: analysis,
        matchItems,
        matchSource: appData.modelSettings.useLlm && matchLog.status === 'success' ? 'llm' : 'rule_engine',
        matchReason: matchLog.status === 'error' ? matchLog.errorMessage : undefined,
        status: activeTask.status === 'pending' ? 'generated' : activeTask.status,
      });
      await refresh();
      message.success({ message: analysisLog.status === 'success' ? 'JD 解析完成' : 'JD 解析完成（已降级为免费规则引擎）' });
    } catch (e) {
      message.error({ message: `解析失败：${(e as Error).message}` });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async (kind: 'internship' | 'project') => {
    if (!activeTask) return;
    if (!activeTask.jdAnalysis) {
      message.error({ message: '请先解析 JD，再生成经历内容' });
      return;
    }
    setGenerating(kind);
    try {
      const { data, log } = await generateContent(kind, activeTask, appData.experienceLibrary, appData.modelSettings);

      // 关键：重新生成的新内容本身 savedVersions 为空，若直接保存，db 层的版本同步逻辑
      // 会把"传入列表中不存在的版本"判定为用户已删除，从而清空数据库里全部历史版本。
      // 这里按 sourceExperienceId 让新生成内容继承旧内容的历史版本，保证版本在重新生成后延续。
      const existingContents = kind === 'internship' ? activeTask.internshipContents : activeTask.projectContents;
      const mergedRecommended = data.recommended.map((item) => {
        const prev = existingContents.find((c) => c.sourceExperienceId === item.sourceExperienceId);
        return prev ? { ...item, savedVersions: prev.savedVersions } : item;
      });

      await db.updateTask(activeTask.id, {
        [kind === 'internship' ? 'internshipContents' : 'projectContents']: mergedRecommended,
        [kind === 'internship' ? 'unrecommendedInternships' : 'unrecommendedProjects']: data.unrecommended,
      });
      void db.logLlmCall(log);
      await refresh();
      const preservedCount = mergedRecommended.reduce((sum, c) => sum + c.savedVersions.length, 0);
      message.success({
        message:
          `${kind === 'internship' ? '实习' : '项目'}经历已生成 ${data.recommended.length} 条推荐` +
          (preservedCount > 0 ? `，已保留 ${preservedCount} 条历史版本` : ''),
      });
    } catch (e) {
      message.error({ message: `生成失败：${(e as Error).message}` });
    } finally {
      setGenerating(null);
    }
  };

  const getContentList = (kind: 'internship' | 'project') =>
    kind === 'internship' ? activeTask?.internshipContents || [] : activeTask?.projectContents || [];

  const updateContentList = async (kind: 'internship' | 'project', nextList: import('@/types').GeneratedContent[]) => {
    if (!activeTask) return;
    await db.updateTask(activeTask.id, {
      [kind === 'internship' ? 'internshipContents' : 'projectContents']: nextList,
    });
    await refresh();
  };

  const handleContentChange = async (
    kind: 'internship' | 'project',
    contentId: string,
    patch: Partial<import('@/types').GeneratedContent>,
  ) => {
    const list = getContentList(kind);
    const nextList = list.map((c) => (c.id === contentId ? { ...c, ...patch } : c));
    await updateContentList(kind, nextList);
  };

  /**
   * 保存版本：latestPatch 是文本框里尚未提交的最新编辑内容（如果用户在失焦前直接点了保存按钮）。
   * 这里把"应用最新编辑"和"追加一条历史快照"合并为一次 updateContentList 调用，
   * 避免拆成两次连续的异步数据库写入——连续写入会产生竞态：后一次请求读取到的"已有行"
   * 可能是前一次请求尚未提交完成时的中间状态，从而误判某条记录已过期而删除，
   * 这正是历史版本偶发丢失的核心原因之一。
   */
  const handleSaveVersion = async (
    kind: 'internship' | 'project',
    contentId: string,
    latestPatch?: Partial<import('@/types').GeneratedContent>,
  ) => {
    const list = getContentList(kind);
    const current = list.find((c) => c.id === contentId);
    if (!current) return;
    const merged = latestPatch ? { ...current, ...latestPatch } : current;
    const starText = `情境：${merged.starVersion.situation}\n任务：${merged.starVersion.task}\n行动：${merged.starVersion.action}\n结果：${merged.starVersion.result}`;
    const newVersion: SavedVersion = {
      id: db.genId('version'),
      resumeVersion: merged.resumeVersion,
      starVersion: starText,
      factBasis: merged.factBasis,
      savedAt: db.nowISO(),
    };
    const nextList = list.map((c) =>
      c.id === contentId ? { ...merged, savedVersions: [newVersion, ...merged.savedVersions] } : c,
    );
    await updateContentList(kind, nextList);
    message.success({ message: '版本已保存' });
  };

  const handleDeleteVersion = async (kind: 'internship' | 'project', contentId: string, versionId: string) => {
    const list = getContentList(kind);
    const nextList = list.map((c) =>
      c.id === contentId ? { ...c, savedVersions: c.savedVersions.filter((v) => v.id !== versionId) } : c,
    );
    await updateContentList(kind, nextList);
  };

  /** 回退到某个历史版本：用该版本的简历文案覆盖当前编辑内容；
   * 回退前会先把"当前正在编辑的内容"另存为一条新历史版本，避免用户回退后再想找回刚才的版本时已经丢失。 */
  const handleRevertVersion = async (kind: 'internship' | 'project', contentId: string, versionId: string) => {
    const list = getContentList(kind);
    const current = list.find((c) => c.id === contentId);
    const version = current?.savedVersions.find((v) => v.id === versionId);
    if (!current || !version) return;

    const currentStarText = `情境：${current.starVersion.situation}\n任务：${current.starVersion.task}\n行动：${current.starVersion.action}\n结果：${current.starVersion.result}`;
    const backupVersion: SavedVersion = {
      id: db.genId('version'),
      resumeVersion: current.resumeVersion,
      starVersion: currentStarText,
      factBasis: current.factBasis,
      savedAt: db.nowISO(),
      note: '回退前自动备份',
    };

    // 历史版本中的 STAR 是拼接后的展示文本，回退时按标签行拆解还原为结构化字段
    const parseStarText = (text: string) => {
      const pick = (label: string) => {
        const m = text.match(new RegExp(`${label}：([\\s\\S]*?)(?:\\n[情任行结]|$)`));
        return m ? m[1].trim() : '';
      };
      return {
        situation: pick('情境') || current.starVersion.situation,
        task: pick('任务') || current.starVersion.task,
        action: pick('行动') || current.starVersion.action,
        result: pick('结果') || current.starVersion.result,
      };
    };

    const nextList = list.map((c) =>
      c.id === contentId
        ? {
            ...c,
            resumeVersion: version.resumeVersion,
            starVersion: parseStarText(version.starVersion),
            factBasis: version.factBasis,
            savedVersions: [backupVersion, ...c.savedVersions],
          }
        : c,
    );
    await updateContentList(kind, nextList);
    message.success({ message: '已回退到该历史版本，回退前的内容已自动备份' });
  };

  // ---------- 经历库相关 ----------
  const handleConfirmInternship = async (data: {
    company: string;
    role: string;
    period: string;
    description: string;
    highlights: string[];
  }) => {
    await db.addInternship(data);
    await refresh();
    setAddExperienceType(null);
  };

  const handleConfirmProject = async (data: {
    name: string;
    role: string;
    period: string;
    description: string;
    techStack: string[];
    highlights: string[];
  }) => {
    await db.addProject(data);
    await refresh();
    setAddExperienceType(null);
  };

  const handleConfirmSkill = async (data: { name: string; category: string; level: 'basic' | 'proficient' | 'expert' }) => {
    await db.addSkill(data);
    await refresh();
    setAddExperienceType(null);
  };

  // ---------- 网站收藏 ----------
  const handleAddSite = async (name: string, url: string) => {
    await db.addFavoriteSite({ name, url });
    await refresh();
  };

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-4)',
          background: 'var(--bg-page)',
        }}
      >
        数据加载中...
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-page)',
      }}
    >
      {/* 顶部标题栏 */}
      <div
        style={{
          height: 'var(--nav-header-height)',
          flexShrink: 0,
          background: 'var(--bg-nav-dark)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon type="briefcase" style={{ fontSize: 20, color: '#fff' }} />
          <span style={{ fontSize: 'var(--fs-18)', fontWeight: 'var(--fw-semibold)', color: '#fff' }}>
            JDsystem
          </span>
          <span style={{ fontSize: 'var(--fs-12)', color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>
            求职 JD 到个人经历匹配工作台
          </span>
          {appData.modelSettings.useLlm ? (
            <span
              style={{
                fontSize: 'var(--fs-12)',
                color: '#fff',
                background: 'var(--color-brand-primary)',
                borderRadius: 'var(--radius-2)',
                padding: '1px 8px',
                marginLeft: 4,
              }}
            >
              AI 模式 · {appData.modelProfiles.find((p) => p.id === appData.activeProfileId)?.name ?? ''}
            </span>
          ) : (
            <span
              style={{
                fontSize: 'var(--fs-12)',
                color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 'var(--radius-2)',
                padding: '1px 8px',
                marginLeft: 4,
              }}
            >
              免费规则模式 · {appData.modelProfiles.find((p) => p.id === appData.activeProfileId)?.name ?? ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Select
            value={appData.activeProfileId}
            onChange={(id: string) => handleSelectProfile(id)}
            clearable={false}
            onlyKeyValue
            size="small"
            style={{ width: 168 }}
            title="切换模型配置"
          >
            {appData.modelProfiles.map((p) => (
              <Select.Option key={p.id} value={p.id}>
                {p.name}
              </Select.Option>
            ))}
          </Select>
          <Button icon="setting" shape="text" style={{ color: '#fff' }} onClick={() => setSettingsOpen(true)}>
            模型设置
          </Button>
        </div>
      </div>

      {/* 三栏主体 */}
      <div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', gap: 16 }}>
        {/* 左栏 */}
        <div style={{ width: 280, flexShrink: 0, height: '100%' }}>
          <TaskListPanel
            tasks={appData.tasks}
            activeTaskId={activeTaskId}
            onSelectTask={setActiveTaskId}
            onAddTask={() => setAddTaskOpen(true)}
            onDeleteTask={handleDeleteTask}
          />
        </div>

        {/* 中间栏 */}
        <div className="scrollbar-hidden" style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}>
          {!activeTask ? (
            <div
              className="dash-card"
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-4)',
              }}
            >
              请从左侧新增或选择一个岗位任务
            </div>
          ) : (
            <>
              <div className="dash-card" style={{ marginBottom: 'var(--gap-module)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 'var(--fs-20)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-1)' }}>
                      {activeTask.title}
                    </div>
                    <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-3)', marginTop: 4 }}>
                      {activeTask.company || '未填写公司'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>当前状态</span>
                    <Select
                      value={activeTask.status}
                      onChange={(val) => handleChangeStatus(val as TaskStatus)}
                      onlyKeyValue
                      clearable={false}
                      style={{ width: 128 }}
                      size="small"
                    >
                      {TASK_STATUS_LIST.map((s) => (
                        <Select.Option key={s.value} value={s.value}>
                          {s.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              <JdInputCard
                task={activeTask}
                settings={appData.modelSettings}
                onChange={handleTaskChange}
                onAnalyze={handleAnalyze}
                analyzing={analyzing}
              />
              <JdAnalysisCard analysis={activeTask.jdAnalysis} />
              <MatchTableCard
                matchItems={activeTask.matchItems}
                matchSource={activeTask.matchSource}
                matchReason={activeTask.matchReason}
              />

              <Row gutter={16}>
                <Col span={12}>
                  <GeneratedContentCard
                    title="实习经历生成"
                    icon="briefcase"
                    contents={activeTask.internshipContents}
                    unrecommended={activeTask.unrecommendedInternships}
                    generating={generating === 'internship'}
                    onGenerate={() => handleGenerate('internship')}
                    onChange={(contentId, patch) => handleContentChange('internship', contentId, patch)}
                    onSaveVersion={(contentId, latestPatch) => handleSaveVersion('internship', contentId, latestPatch)}
                    onDeleteVersion={(contentId, versionId) => handleDeleteVersion('internship', contentId, versionId)}
                    onRevertVersion={(contentId, versionId) => handleRevertVersion('internship', contentId, versionId)}
                  />
                </Col>
                <Col span={12}>
                  <GeneratedContentCard
                    title="项目经历生成"
                    icon="folder-fill"
                    contents={activeTask.projectContents}
                    unrecommended={activeTask.unrecommendedProjects}
                    generating={generating === 'project'}
                    onGenerate={() => handleGenerate('project')}
                    onChange={(contentId, patch) => handleContentChange('project', contentId, patch)}
                    onSaveVersion={(contentId, latestPatch) => handleSaveVersion('project', contentId, latestPatch)}
                    onDeleteVersion={(contentId, versionId) => handleDeleteVersion('project', contentId, versionId)}
                    onRevertVersion={(contentId, versionId) => handleRevertVersion('project', contentId, versionId)}
                  />
                </Col>
              </Row>
            </>
          )}
        </div>

        {/* 右栏 */}
        <div style={{ width: 320, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ExperienceLibraryPanel
              library={appData.experienceLibrary}
              onAddInternship={() => setAddExperienceType('internship')}
              onAddProject={() => setAddExperienceType('project')}
              onAddSkill={() => setAddExperienceType('skill')}
              onDeleteInternship={async (id) => {
                await db.deleteInternship(id);
                await refresh();
              }}
              onDeleteProject={async (id) => {
                await db.deleteProject(id);
                await refresh();
              }}
              onDeleteSkill={async (id) => {
                await db.deleteSkill(id);
                await refresh();
              }}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <FavoriteSitesPanel
              sites={appData.favoriteSites}
              onAdd={handleAddSite}
              onTogglePin={async (id) => {
                await db.toggleFavoriteSitePin(id);
                await refresh();
              }}
              onDelete={async (id) => {
                await db.deleteFavoriteSite(id);
                await refresh();
              }}
            />
          </div>
        </div>
      </div>

      {/* 弹窗集合 */}
      <AddTaskModal open={addTaskOpen} onClose={() => setAddTaskOpen(false)} onConfirm={handleAddTask} />
      <AddExperienceModal
        type={addExperienceType}
        onClose={() => setAddExperienceType(null)}
        onConfirmInternship={handleConfirmInternship}
        onConfirmProject={handleConfirmProject}
        onConfirmSkill={handleConfirmSkill}
      />
      <ModelSettingsModal
        open={settingsOpen}
        profiles={appData.modelProfiles}
        activeProfileId={appData.activeProfileId}
        onClose={() => setSettingsOpen(false)}
        onSaveActive={async (settings) => {
          await db.saveActiveProfileSettings(settings);
          await refresh();
        }}
        onSaveNew={async (name, settings) => {
          await db.saveNewProfile(name, settings);
          await refresh();
        }}
        onDelete={async (id) => {
          await db.deleteModelProfile(id);
          await refresh();
        }}
        onRename={async (id, name) => {
          await db.renameModelProfile(id, name);
          await refresh();
        }}
        onSelectProfile={handleSelectProfile}
      />
    </div>
  );
}
