import { Icon } from '@/vendor/mtd-react3';
import type { ContentSource } from '@/types';

/**
 * 来源提示横幅：当某块结果由「规则引擎」生成时，在卡片顶部给出明确提示，
 * 让用户一眼知道"这部分不是 AI 写的"。
 *
 * - 降级场景（本想调大模型但失败，如 429 限流）：橙色警示横幅，附具体失败原因，
 *   并提示"模型恢复后重新解析"；
 * - 规则引擎模式（用户主动未启用大模型）：蓝色信息横幅，说明这是规则引擎结果。
 *
 * 大模型成功生成（source === 'llm'）时不渲染任何东西，避免干扰。
 */
const DEGRADE_PREFIX = 'LLM 调用失败已降级为规则引擎：';

export default function SourceBanner({ source, reason }: { source: ContentSource; reason?: string }) {
  if (source !== 'rule_engine') return null;

  // 降级原因里去掉我们内部加的固定前缀，只保留对用户有意义的失败细节（如 "模型服务返回 429：…"）
  const detail = reason ? (reason.startsWith(DEGRADE_PREFIX) ? reason.slice(DEGRADE_PREFIX.length) : reason) : '';

  if (reason) {
    return (
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          marginBottom: 12,
          padding: '8px 10px',
          background: 'rgba(255,119,0,0.10)',
          border: '1px solid rgba(255,119,0,0.45)',
          borderRadius: 'var(--radius-3)',
        }}
      >
        <Icon type="warning-o" style={{ fontSize: 14, color: 'var(--color-orange)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 'var(--fs-12)', lineHeight: '18px', color: 'var(--color-orange)' }}>
          以下由<strong>规则引擎</strong>生成（模型调用失败，已自动降级
          {detail ? `：${detail}` : ''}）。结果可能不完整，建议模型恢复后重新解析。
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        marginBottom: 12,
        padding: '8px 10px',
        background: 'var(--color-primary-4)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--radius-3)',
      }}
    >
      <Icon type="info-o" style={{ fontSize: 14, color: 'var(--color-brand-primary)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 'var(--fs-12)', lineHeight: '18px', color: 'var(--text-2)' }}>
        当前为<strong>规则引擎模式</strong>（未启用大模型），以下由规则引擎生成。
      </div>
    </div>
  );
}
