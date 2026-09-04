import { useMemo, useState } from 'react';
import { Button, Input, Icon, Popconfirm, Empty, message } from '@/vendor/mtd-react3';
import type { FavoriteSite } from '@/types';

interface FavoriteSitesPanelProps {
  sites: FavoriteSite[];
  onAdd: (name: string, url: string) => void;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function FavoriteSitesPanel({ sites, onAdd, onTogglePin, onDelete }: FavoriteSitesPanelProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const sortedSites = useMemo(() => {
    return [...sites].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [sites]);

  const handleConfirmAdd = () => {
    if (!name.trim() || !url.trim()) {
      message.warning({ message: '请填写网站名称和链接' });
      return;
    }
    onAdd(name.trim(), normalizeUrl(url));
    message.success({ message: '已添加' });
    setName('');
    setUrl('');
    setAdding(false);
  };

  const handleOpen = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="dash-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="card-title-bar">
        <div className="dash-title">常用网站收藏</div>
        <Button type="primary" size="small" icon="add" onClick={() => setAdding((v) => !v)}>
          {adding ? '取消' : '添加'}
        </Button>
      </div>

      {adding && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 12,
            padding: 12,
            borderRadius: 'var(--radius-4)',
            background: 'var(--bg-card-inner)',
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="网站名称，如：拉勾网" />
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="网站链接，如：www.lagou.com" />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" size="small" onClick={handleConfirmAdd}>
              确认添加
            </Button>
          </div>
        </div>
      )}

      <div className="scrollbar-hidden" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {sortedSites.length === 0 ? (
          <Empty description="暂无收藏网站" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedSites.map((site) => (
              <div
                key={site.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-4)',
                  background: 'var(--bg-card-inner)',
                }}
              >
                <div
                  onClick={() => handleOpen(site.url)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0, flex: 1 }}
                >
                  <Icon type="globe" style={{ fontSize: 14, color: 'var(--color-brand-primary)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 'var(--fs-14)',
                        color: 'var(--text-1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {site.name}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--fs-12)',
                        color: 'var(--text-4)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {site.url}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                  <Icon
                    type={site.pinned ? 'top' : 'top'}
                    style={{
                      fontSize: 14,
                      color: site.pinned ? 'var(--color-accent-text)' : 'var(--text-5)',
                      cursor: 'pointer',
                    }}
                    onClick={() => onTogglePin(site.id)}
                  />
                  <Popconfirm
                    message="确定删除该网站收藏吗？"
                    trigger="click"
                    onOk={() => {
                      onDelete(site.id);
                      message.success({ message: '已删除' });
                    }}
                  >
                    <Icon type="delete" style={{ fontSize: 14, color: 'var(--text-5)', cursor: 'pointer' }} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
