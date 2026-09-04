import { useState } from 'react';
import { Button, Tabs, Tag, Icon, Popconfirm, Empty, message } from '@/vendor/mtd-react3';
import type { ExperienceLibrary } from '@/types';

const { TabPane } = Tabs;

interface ExperienceLibraryPanelProps {
  library: ExperienceLibrary;
  onAddInternship: () => void;
  onAddProject: () => void;
  onAddSkill: () => void;
  onDeleteInternship: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDeleteSkill: (id: string) => void;
}

const LEVEL_LABEL: Record<string, string> = {
  basic: '了解',
  proficient: '熟练',
  expert: '精通',
};

export default function ExperienceLibraryPanel({
  library,
  onAddInternship,
  onAddProject,
  onAddSkill,
  onDeleteInternship,
  onDeleteProject,
  onDeleteSkill,
}: ExperienceLibraryPanelProps) {
  const [tab, setTab] = useState<'internships' | 'projects' | 'skills'>('internships');

  return (
    <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="card-title-bar">
        <div className="dash-title">个人资料库</div>
        <Button
          type="primary"
          size="small"
          icon="add"
          onClick={() => {
            if (tab === 'internships') onAddInternship();
            else if (tab === 'projects') onAddProject();
            else onAddSkill();
          }}
        >
          新增
        </Button>
      </div>

      <Tabs activeKey={tab} onChange={(v: string) => setTab(v as 'internships' | 'projects' | 'skills')}>
        <TabPane label={`实习(${library.internships.length})`} key="internships" />
        <TabPane label={`项目(${library.projects.length})`} key="projects" />
        <TabPane label={`技能(${library.skills.length})`} key="skills" />
      </Tabs>

      <div className="scrollbar-hidden" style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 12 }}>
        {tab === 'internships' &&
          (library.internships.length === 0 ? (
            <Empty description="暂无实习经历" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {library.internships.map((item) => (
                <div key={item.id} style={{ padding: 12, borderRadius: 'var(--radius-4)', background: 'var(--bg-card-inner)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 'var(--fs-14)', fontWeight: 'var(--fw-medium)', color: 'var(--text-1)' }}>
                        {item.company} · {item.role}
                      </div>
                      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginTop: 2 }}>{item.period}</div>
                    </div>
                    <Popconfirm
                      message="确定删除该实习经历吗？"
                      trigger="click"
                      onOk={() => {
                        onDeleteInternship(item.id);
                        message.success({ message: '已删除' });
                      }}
                    >
                      <Icon type="delete" style={{ fontSize: 14, color: 'var(--text-4)', cursor: 'pointer', flexShrink: 0 }} />
                    </Popconfirm>
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-3)', marginTop: 6, lineHeight: '20px' }}>
                    {item.description}
                  </div>
                  {item.highlights.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {item.highlights.map((h, i) => (
                        <Tag key={i} theme="blue" size="mini" type="pure">
                          {h}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

        {tab === 'projects' &&
          (library.projects.length === 0 ? (
            <Empty description="暂无项目经历" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {library.projects.map((item) => (
                <div key={item.id} style={{ padding: 12, borderRadius: 'var(--radius-4)', background: 'var(--bg-card-inner)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 'var(--fs-14)', fontWeight: 'var(--fw-medium)', color: 'var(--text-1)' }}>
                        {item.name} · {item.role}
                      </div>
                      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginTop: 2 }}>{item.period}</div>
                    </div>
                    <Popconfirm
                      message="确定删除该项目经历吗？"
                      trigger="click"
                      onOk={() => {
                        onDeleteProject(item.id);
                        message.success({ message: '已删除' });
                      }}
                    >
                      <Icon type="delete" style={{ fontSize: 14, color: 'var(--text-4)', cursor: 'pointer', flexShrink: 0 }} />
                    </Popconfirm>
                  </div>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-3)', marginTop: 6, lineHeight: '20px' }}>
                    {item.description}
                  </div>
                  {item.techStack.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {item.techStack.map((t, i) => (
                        <Tag key={i} theme="lightgray" size="mini" type="pure">
                          {t}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {item.highlights.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {item.highlights.map((h, i) => (
                        <Tag key={i} theme="green" size="mini" type="pure">
                          {h}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

        {tab === 'skills' &&
          (library.skills.length === 0 ? (
            <Empty description="暂无技能" />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {library.skills.map((item) => (
                <Tag
                  key={item.id}
                  theme="blue"
                  type="bordered"
                  closeable
                  onClose={() => {
                    onDeleteSkill(item.id);
                    message.success({ message: '已删除' });
                  }}
                >
                  {item.name}（{LEVEL_LABEL[item.level]}）
                </Tag>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
