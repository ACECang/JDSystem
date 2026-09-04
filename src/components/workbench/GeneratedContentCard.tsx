import { useEffect, useState } from 'react';
import { Button, Tabs, Tag, Icon, message, Popconfirm, Empty, Input, Collapse } from '@/vendor/mtd-react3';
import type { GeneratedContent, StarVersion, UnrecommendedExperience } from '@/types';
import { copyText, formatDateTime } from '@/lib/utils';
import SourceBanner from './SourceBanner';

const { TabPane } = Tabs;

interface GeneratedContentCardProps {
  title: string;
  icon: string;
  contents: GeneratedContent[];
  unrecommended: UnrecommendedExperience[];
  onGenerate: () => void;
  generating: boolean;
  onChange: (contentId: string, patch: Partial<GeneratedContent>) => void;
  /** 保存版本：把待提交的最新编辑内容（simple patch）与"存一条历史快照"合并为一次数据库写入，避免连续两次异步写入产生竞态 */
  onSaveVersion: (contentId: string, latestPatch?: Partial<GeneratedContent>) => void;
  onDeleteVersion: (contentId: string, versionId: string) => void;
  onRevertVersion: (contentId: string, versionId: string) => void;
}

const EVIDENCE_TYPE_MAP: Record<string, { label: string; theme: string }> = {
  fact_supported: { label: '事实支撑', theme: 'green' },
  reasonable_rewrite: { label: '合理润色', theme: 'blue' },
  needs_confirmation: { label: '待确认', theme: 'orange' },
};

function starToText(star: StarVersion): string {
  return `情境（S）：${star.situation}\n任务（T）：${star.task}\n行动（A）：${star.action}\n结果（R）：${star.result}`;
}

export default function GeneratedContentCard({
  title,
  icon,
  contents,
  unrecommended,
  onGenerate,
  generating,
  onChange,
  onSaveVersion,
  onDeleteVersion,
  onRevertVersion,
}: GeneratedContentCardProps) {
  // 整段内容同一次生成来源一致：取首个规则引擎项作为横幅来源/原因
  const ruleItem = contents.find((c) => c.contentSource === 'rule_engine');

  return (
    <div className="dash-card" style={{ marginBottom: 'var(--gap-module)' }}>
      <div className="card-title-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon type={icon} style={{ fontSize: 16, color: 'var(--color-accent-text)' }} />
          <span className="dash-title">{title}</span>
          {contents.length > 0 && (
            <Tag theme="lightgray" size="mini" type="pure">
              共 {contents.length} 条推荐
            </Tag>
          )}
        </div>
        <Button type="primary" size="small" icon="edit" loading={generating} onClick={onGenerate}>
          {contents.length > 0 ? '重新生成' : '生成内容'}
        </Button>
      </div>

      {ruleItem && <SourceBanner source={ruleItem.contentSource} reason={ruleItem.ruleReason} />}

      {contents.length === 0 ? (
        <div style={{ padding: '24px 0' }}>
          <Empty description="暂无生成内容，点击右上角生成" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {contents.map((content, idx) => (
            <SingleContentBlock
              key={content.id}
              index={idx}
              content={content}
              onChange={(patch) => onChange(content.id, patch)}
              onSaveVersion={(latestPatch) => onSaveVersion(content.id, latestPatch)}
              onDeleteVersion={(versionId) => onDeleteVersion(content.id, versionId)}
              onRevertVersion={(versionId) => onRevertVersion(content.id, versionId)}
            />
          ))}
        </div>
      )}

      {unrecommended.length > 0 && (
        <Collapse style={{ marginTop: 16 }} type="simple">
          <Collapse.Item code="unrecommended" title={`未推荐的经历（${unrecommended.length}）`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unrecommended.map((u) => (
                <div
                  key={u.experienceId}
                  style={{ padding: '8px 10px', background: 'var(--bg-card-inner)', borderRadius: 'var(--radius-3)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 'var(--fs-13)', color: 'var(--text-2)', fontWeight: 'var(--fw-medium)' }}>
                      {u.experienceLabel}
                    </span>
                    <Tag theme="lightgray" size="mini" type="pure-bordered">
                      匹配分 {u.matchScore}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>{u.reason}</div>
                </div>
              ))}
            </div>
          </Collapse.Item>
        </Collapse>
      )}
    </div>
  );
}

interface SingleContentBlockProps {
  index: number;
  content: GeneratedContent;
  onChange: (patch: Partial<GeneratedContent>) => void;
  onSaveVersion: (latestPatch?: Partial<GeneratedContent>) => void;
  onDeleteVersion: (versionId: string) => void;
  onRevertVersion: (versionId: string) => void;
}

function SingleContentBlock({ index, content, onChange, onSaveVersion, onDeleteVersion, onRevertVersion }: SingleContentBlockProps) {
  const [tab, setTab] = useState<'resume' | 'star' | 'evidence' | 'history'>('resume');

  // 简历版/STAR 版文本框改为「本地编辑态 + 失焦/保存时才落库」，
  // 避免此前「逐字符触发 onChange -> 全量数据库保存」导致的高频并发写入竞态
  // （竞态会导致「保存历史版本」的行同时被另一次未完成的旧保存请求判定为过期而误删，
  //  这正是历史版本偶发丢失的根因之一）。
  const [localResume, setLocalResume] = useState(content.resumeVersion);
  const [localStar, setLocalStar] = useState<StarVersion>(content.starVersion);

  useEffect(() => {
    setLocalResume(content.resumeVersion);
    setLocalStar(content.starVersion);
  }, [content.id, content.resumeVersion, content.starVersion]);

  const commitResumeIfChanged = () => {
    if (localResume !== content.resumeVersion) onChange({ resumeVersion: localResume });
  };
  const commitStarIfChanged = () => {
    if (JSON.stringify(localStar) !== JSON.stringify(content.starVersion)) onChange({ starVersion: localStar });
  };

  /** 简历版 tab 的「保存版本」：把本地最新文本随保存动作一并提交，只触发一次数据库写入 */
  const handleSaveResumeVersion = () => {
    const changed = localResume !== content.resumeVersion;
    onSaveVersion(changed ? { resumeVersion: localResume } : undefined);
  };
  /** STAR 版 tab 的「保存版本」：同上，避免"先 commit 一次、再 saveVersion 一次"产生的连续异步写入竞态 */
  const handleSaveStarVersion = () => {
    const changed = JSON.stringify(localStar) !== JSON.stringify(content.starVersion);
    onSaveVersion(changed ? { starVersion: localStar } : undefined);
  };

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      message.success({ message: '已复制到剪贴板' });
    } else {
      message.error({ message: '复制失败，请手动选择复制' });
    }
  };

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 'var(--radius-4)',
        border: '1px solid var(--border-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag theme="blue" size="mini" type="pure">
            推荐 #{index + 1}
          </Tag>
          <span style={{ fontSize: 'var(--fs-14)', color: 'var(--text-1)', fontWeight: 'var(--fw-medium)' }}>
            {content.sourceExperienceLabel}
          </span>
          <Tag theme="lightgray" size="mini" type="pure-bordered">
            匹配分 {content.matchScore}
          </Tag>
          <Tag theme={content.contentSource === 'llm' ? 'blue' : 'lightgray'} size="mini" type="pure">
            {content.contentSource === 'llm' ? 'AI 生成' : '规则引擎生成'}
          </Tag>
        </div>
      </div>

      {content.matchedRequirements.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>命中要求：</span>
          {content.matchedRequirements.map((r, i) => (
            <Tag key={i} theme="green" size="mini" type="pure-bordered">
              {r}
            </Tag>
          ))}
        </div>
      )}

      {content.riskFlags.length > 0 && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            background: 'rgba(255,152,0,0.08)',
            borderRadius: 'var(--radius-3)',
            fontSize: 'var(--fs-12)',
            color: 'var(--color-warning-text)',
          }}
        >
          {content.riskFlags.map((r, i) => (
            <div key={i}>⚠ {r}</div>
          ))}
        </div>
      )}

      <Tabs activeKey={tab} onChange={(v: string) => setTab(v as 'resume' | 'star' | 'evidence' | 'history')}>
        <TabPane label="简历版" key="resume">
          <Input.TextArea
            value={localResume}
            onChange={(e) => setLocalResume((e.target as HTMLTextAreaElement).value)}
            onBlur={commitResumeIfChanged}
            rows={6}
            style={{ width: '100%', marginTop: 12 }}
          />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="small" icon="copy" onClick={() => handleCopy(localResume)}>
              复制
            </Button>
            <Button size="small" icon="save" onClick={handleSaveResumeVersion}>
              保存版本
            </Button>
          </div>
        </TabPane>
        <TabPane label="STAR 版" key="star">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {(['situation', 'task', 'action', 'result'] as const).map((field) => (
              <div key={field}>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginBottom: 4 }}>
                  {{ situation: '情境（S）', task: '任务（T）', action: '行动（A）', result: '结果（R）' }[field]}
                </div>
                <Input.TextArea
                  value={localStar[field]}
                  onChange={(e) =>
                    setLocalStar((prev) => ({ ...prev, [field]: (e.target as HTMLTextAreaElement).value }))
                  }
                  onBlur={commitStarIfChanged}
                  rows={2}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="small" icon="copy" onClick={() => handleCopy(starToText(localStar))}>
              复制
            </Button>
            <Button size="small" icon="save" onClick={handleSaveStarVersion}>
              保存版本
            </Button>
          </div>
        </TabPane>
        <TabPane label="事实溯源" key="evidence">
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {content.sentenceEvidenceMap.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 'var(--fs-14)' }}>
                暂无句子级溯源记录
              </div>
            ) : (
              content.sentenceEvidenceMap.map((e, i) => {
                const meta = EVIDENCE_TYPE_MAP[e.evidenceType] || { label: e.evidenceType, theme: 'lightgray' };
                return (
                  <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-card-inner)', borderRadius: 'var(--radius-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Tag theme={meta.theme as any} size="mini" type="pure">
                        {meta.label}
                      </Tag>
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>来源：{e.sourceField}</span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-13)', color: 'var(--text-2)', lineHeight: '20px' }}>{e.sentence}</div>
                  </div>
                );
              })
            )}
            {content.usedFactFragments.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginBottom: 6 }}>使用的事实片段</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {content.usedFactFragments.map((f, i) => (
                    <Tag key={i} theme="lightgray" size="mini" type="pure-bordered">
                      {f}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            {content.usedJdRequirements.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginBottom: 6 }}>本次引用的 JD 要求</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {content.usedJdRequirements.map((r, i) => (
                    <Tag key={i} theme="blue" size="mini" type="pure-bordered">
                      {r}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabPane>
        <TabPane label={`历史版本(${content.savedVersions.length})`} key="history">
          <div style={{ marginTop: 12 }}>
            {content.savedVersions.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 'var(--fs-14)' }}>
                暂无保存的历史版本
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {content.savedVersions.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      padding: 12,
                      borderRadius: 'var(--radius-4)',
                      background: 'var(--bg-card-inner)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>
                          {formatDateTime(v.savedAt)}
                        </span>
                        {v.note && (
                          <Tag theme="lightgray" size="mini" type="pure-bordered">
                            {v.note}
                          </Tag>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Popconfirm
                          message="确定回退到该历史版本吗？当前内容会先自动备份一份历史版本"
                          trigger="click"
                          onOk={() => {
                            onRevertVersion(v.id);
                          }}
                        >
                          <span
                            style={{ fontSize: 'var(--fs-12)', color: 'var(--color-brand-primary)', cursor: 'pointer' }}
                          >
                            回退到此版本
                          </span>
                        </Popconfirm>
                        <Icon
                          type="copy"
                          style={{ fontSize: 14, color: 'var(--text-3)', cursor: 'pointer' }}
                          onClick={() => handleCopy(v.resumeVersion)}
                        />
                        <Popconfirm
                          message="确定删除该历史版本吗？"
                          trigger="click"
                          onOk={() => {
                            onDeleteVersion(v.id);
                            message.success({ message: '已删除' });
                          }}
                        >
                          <Icon type="delete" style={{ fontSize: 14, color: 'var(--text-3)', cursor: 'pointer' }} />
                        </Popconfirm>
                      </div>
                    </div>
                    <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-2)', lineHeight: '22px' }}>
                      {v.resumeVersion}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabPane>
      </Tabs>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginBottom: 6 }}>事实依据</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {content.factBasis.map((f, i) => (
            <Tag key={i} theme="lightgray" size="mini" type="pure">
              {f}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );
}
