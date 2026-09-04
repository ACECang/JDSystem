import { useMemo, useState } from 'react';
import { Input, Button, Select, Tag, Popconfirm, Empty, Icon, message } from '@/vendor/mtd-react3';
import type { JobTask, TaskStatus } from '@/types';
import { TASK_STATUS_LIST } from '@/types';
import { formatDateGroup, formatDateTime, getStatusTheme } from '@/lib/utils';

interface TaskListPanelProps {
  tasks: JobTask[];
  activeTaskId: string | null;
  onSelectTask: (id: string) => void;
  onAddTask: () => void;
  onDeleteTask: (id: string) => void;
}

export default function TaskListPanel({
  tasks,
  activeTaskId,
  onSelectTask,
  onAddTask,
  onDeleteTask,
}: TaskListPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('');

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchKeyword =
        !keyword.trim() ||
        t.title.toLowerCase().includes(keyword.trim().toLowerCase()) ||
        t.company.toLowerCase().includes(keyword.trim().toLowerCase());
      const matchStatus = !statusFilter || t.status === statusFilter;
      return matchKeyword && matchStatus;
    });
  }, [tasks, keyword, statusFilter]);

  const groups = useMemo(() => {
    const map = new Map<string, JobTask[]>();
    // 按 createdAt 倒序
    const sorted = [...filteredTasks].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    sorted.forEach((t) => {
      const key = formatDateGroup(t.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries());
  }, [filteredTasks]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-3)',
      }}
    >
      {/* 头部：标题 + 新增 */}
      <div
        style={{
          padding: 'var(--card-padding)',
          paddingBottom: 'var(--gap-elem)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 'var(--fs-18)', fontWeight: 'var(--fw-semibold)', color: 'var(--text-1)' }}>
            岗位任务
          </div>
          <Button type="primary" icon="add" size="small" onClick={onAddTask}>
            新增
          </Button>
        </div>
        <Input.Search
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索岗位/公司"
          style={{ width: '100%', marginBottom: 8 }}
        />
        <Select
          value={statusFilter}
          onChange={(val) => setStatusFilter((val ?? '') as TaskStatus | '')}
          placeholder="全部状态"
          style={{ width: '100%' }}
          clearable
        >
          <Select.Option value="">全部状态</Select.Option>
          {TASK_STATUS_LIST.map((s) => (
            <Select.Option key={s.value} value={s.value}>
              {s.label}
            </Select.Option>
          ))}
        </Select>
      </div>

      {/* 列表区 */}
      <div
        className="scrollbar-hidden"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '0 var(--card-padding) var(--card-padding)',
        }}
      >
        {groups.length === 0 && (
          <div style={{ marginTop: 40 }}>
            <Empty description="暂无匹配的岗位任务" />
          </div>
        )}
        {groups.map(([dateLabel, list]) => (
          <div key={dateLabel} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 'var(--fs-12)',
                color: 'var(--text-4)',
                marginBottom: 8,
                fontWeight: 'var(--fw-medium)',
              }}
            >
              {dateLabel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((task) => {
                const active = task.id === activeTaskId;
                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-4)',
                      padding: '10px 12px',
                      background: active ? 'var(--color-primary-4)' : 'var(--bg-card-inner)',
                      border: active ? '1px solid var(--color-brand-primary)' : '1px solid transparent',
                      transition: 'all 0.2s',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'var(--fs-14)',
                          fontWeight: 'var(--fw-medium)',
                          color: 'var(--text-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 130,
                        }}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                      <Popconfirm
                        message="确定删除该岗位任务吗？"
                        trigger="click"
                        placement="right"
                        onOk={() => {
                          onDeleteTask(task.id);
                          message.success({ message: '已删除' });
                        }}
                      >
                        <Icon
                          type="delete"
                          style={{ fontSize: 14, color: 'var(--text-4)', flexShrink: 0 }}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                      </Popconfirm>
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--fs-12)',
                        color: 'var(--text-3)',
                        marginBottom: 8,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {task.company || '未填写公司'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Tag theme={getStatusTheme(task.status) as any} size="mini" type="pure-bordered">
                        {TASK_STATUS_LIST.find((s) => s.value === task.status)?.label}
                      </Tag>
                      <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-5)' }}>
                        {formatDateTime(task.updatedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
