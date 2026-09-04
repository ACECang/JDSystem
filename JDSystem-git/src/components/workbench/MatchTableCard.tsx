import { Tag, Icon, Empty, Collapse } from '@/vendor/mtd-react3';
import type { ContentSource, MatchItem } from '@/types';
import SourceBanner from './SourceBanner';

interface MatchTableCardProps {
  matchItems: MatchItem[];
  /** 匹配表来源：llm = AI 匹配；rule_engine = 规则引擎匹配（可能因模型调用失败降级） */
  matchSource?: ContentSource;
  /** 降级原因：模型调用失败时填写（如 429 限流），用于横幅提示 */
  matchReason?: string;
}

const MATCH_LEVEL_MAP: Record<MatchItem['matchLevel'], { label: string; theme: string }> = {
  strong: { label: '强匹配', theme: 'green' },
  partial: { label: '部分匹配', theme: 'orange' },
  weak: { label: '弱匹配', theme: 'gray' },
  no_evidence: { label: '无证据', theme: 'red' },
};

const EXPERIENCE_TYPE_MAP: Record<string, string> = {
  internship: '实习经历',
  project: '项目经历',
};

/** 单条 JD 要求 - 经历证据匹配的详情行，用于折叠面板内展示除标题外的其余信息 */
function MatchDetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0' }}>
      <div style={{ flexShrink: 0, width: 84, fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>{label}</div>
      <div style={{ flex: 1, fontSize: 'var(--fs-13)', color: valueColor || 'var(--text-2)', lineHeight: '20px' }}>{value}</div>
    </div>
  );
}

export default function MatchTableCard({ matchItems, matchSource, matchReason }: MatchTableCardProps) {
  return (
    <div className="dash-card" style={{ marginBottom: 'var(--gap-module)' }}>
      <div className="card-title-bar">
        <div className="dash-title">JD 要求 - 经历证据匹配表</div>
        {matchItems.length > 0 && (
          <Tag theme="lightgray" size="mini" type="pure">
            共 {matchItems.length} 项
          </Tag>
        )}
      </div>

      {matchSource === 'rule_engine' && (
        <SourceBanner source="rule_engine" reason={matchReason} />
      )}

      {matchItems.length === 0 ? (
        <div style={{ padding: '24px 0' }}>
          <Empty description="暂无匹配数据，请先解析 JD" />
        </div>
      ) : (
        <Collapse type="simple">
          {matchItems.map((item, index) => {
            const meta = MATCH_LEVEL_MAP[item.matchLevel];
            return (
              <Collapse.Item
                key={item.id}
                code={item.id}
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', paddingRight: 8 }}>
                    <span style={{ flexShrink: 0, fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>#{index + 1}</span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 'var(--fs-14)',
                        color: 'var(--text-1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={item.requirement}
                    >
                      {item.requirement}
                    </span>
                    {item.matchedExperienceType && (
                      <Tag theme="lightgray" size="mini" type="pure-bordered">
                        {EXPERIENCE_TYPE_MAP[item.matchedExperienceType]}
                      </Tag>
                    )}
                    <Tag theme={meta.theme as any} size="mini" type="pure-bordered">
                      {meta.label}
                    </Tag>
                    {item.riskOfOverclaim && <Icon type="warning-o" style={{ fontSize: 14, color: 'var(--color-warning-text)' }} />}
                  </div>
                }
              >
                <div style={{ padding: '4px 4px 8px' }}>
                  <MatchDetailRow label="核心动作要求" value={item.coreActionRequired} />
                  <MatchDetailRow label="实际动作" value={item.matchedAction} />
                  <MatchDetailRow label="结果价值证据" value={item.valueEvidence} />
                  <MatchDetailRow label="证据描述" value={item.evidence} />
                  <MatchDetailRow label="判定理由" value={item.matchReason} />
                  <MatchDetailRow label="缺失信息" value={item.missingInfo} />
                  <MatchDetailRow label="风险提示" value={item.riskOfOverclaim} valueColor="var(--color-error-text)" />
                </div>
              </Collapse.Item>
            );
          })}
        </Collapse>
      )}
    </div>
  );
}
