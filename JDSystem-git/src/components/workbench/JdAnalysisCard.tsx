import { Tag, Icon } from '@/vendor/mtd-react3';
import type { JDAnalysis } from '@/types';
import SourceBanner from './SourceBanner';

interface JdAnalysisCardProps {
  analysis: JDAnalysis | null;
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Icon type={icon} style={{ fontSize: 14, color: 'var(--color-brand-primary)' }} />
        <span style={{ fontSize: 'var(--fs-14)', fontWeight: 'var(--fw-medium)', color: 'var(--text-1)' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function JdAnalysisCard({ analysis }: JdAnalysisCardProps) {
  if (!analysis) {
    return (
      <div className="dash-card" style={{ marginBottom: 'var(--gap-module)' }}>
        <div className="card-title-bar">
          <div className="dash-title">JD 解析结果</div>
        </div>
        <div
          style={{
            padding: '32px 0',
            textAlign: 'center',
            color: 'var(--text-4)',
            fontSize: 'var(--fs-14)',
          }}
        >
          请先输入 JD 内容并点击"解析 JD"
        </div>
      </div>
    );
  }

  return (
    <div className="dash-card" style={{ marginBottom: 'var(--gap-module)' }}>
      <div className="card-title-bar">
        <div className="dash-title">JD 解析结果</div>
        <Tag theme={analysis.analysisSource === 'llm' ? 'blue' : 'lightgray'} size="mini" type="pure">
          {analysis.analysisSource === 'llm' ? 'AI 解析' : '规则引擎解析'}
        </Tag>
      </div>
      <SourceBanner source={analysis.analysisSource} reason={analysis.ruleReason} />

      <Section icon="briefcase" title="业务背景与方向判断">
        <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-2)', lineHeight: '22px', marginBottom: 8 }}>
          {analysis.background.rawSentences.join('；') || '暂无'}
        </div>
        <div
          style={{
            fontSize: 'var(--fs-13)',
            color: 'var(--color-brand-primary)',
            background: 'var(--color-primary-4)',
            borderRadius: 'var(--radius-3)',
            padding: '8px 10px',
            marginBottom: 8,
          }}
        >
          方向判断：{analysis.background.direction}
        </div>
        {analysis.background.negativeSignals.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {analysis.background.negativeSignals.map((s, i) => (
              <div key={i} style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>
                · 负向筛选：{s}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon="list-view" title="工作内容（四层拆解）">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {analysis.responsibilities.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-3)',
                background: 'var(--bg-card-inner)',
                border: item.priority === 'core' ? '1px solid var(--color-brand-primary)' : '1px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--fs-14)', color: 'var(--text-1)', fontWeight: 'var(--fw-medium)' }}>
                  {item.rawText}
                </span>
                <Tag theme={item.priority === 'core' ? 'blue' : 'lightgray'} size="mini" type="pure">
                  {item.priority === 'core' ? '核心' : '次要'}
                </Tag>
              </div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-3)', lineHeight: '20px' }}>
                核心动作：{item.coreAction} ｜ 背后能力：{item.requiredCapability}
              </div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', lineHeight: '20px' }}>
                需要证据：{item.evidenceType} ｜ 提取方向：{item.extractionHint}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section icon="warning-circle-o" title="硬性门槛">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {analysis.hardRequirements.length === 0 && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>暂无</span>
          )}
          {analysis.hardRequirements.map((item) => (
            <Tag key={item.id} theme="blue" type="pure-bordered" size="small">
              {item.rawText}
            </Tag>
          ))}
        </div>
      </Section>

      <Section icon="avatar-fill" title="软性素质（行为翻译）">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {analysis.softSkills.length === 0 && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>暂无</span>
          )}
          {analysis.softSkills.map((item) => (
            <div key={item.id} style={{ padding: '8px 10px', background: 'var(--bg-card-inner)', borderRadius: 'var(--radius-3)' }}>
              <Tag theme="purple" type="pure-bordered" size="small" style={{ marginBottom: 4 }}>
                {item.rawText}
              </Tag>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-2)', lineHeight: '20px' }}>
                行为翻译：{item.behaviorTranslation}
              </div>
              <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>提取方向：{item.extractionHint}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section icon="star" title="加分项">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {analysis.bonusPoints.length === 0 && (
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>暂无</span>
          )}
          {analysis.bonusPoints.map((item) => (
            <Tag key={item.id} theme="orange" type="pure-bordered" size="small" title={item.extractionHint}>
              {item.rawText}
            </Tag>
          ))}
        </div>
      </Section>

      {analysis.toolKeywords.length > 0 && (
        <Section icon="tag" title="工具/技术关键词（仅供参考，非核心匹配依据）">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {analysis.toolKeywords.map((k, i) => (
              <Tag key={i} theme="lightgray" size="mini" type="pure">
                {k}
              </Tag>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
