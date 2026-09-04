/**
 * 大模型 HTTP 调用公共层。
 *
 * 视觉理解（VisionExtractor）与文本生成（TextGenerator）都经这里发请求，
 * 保证端点拼装、超时控制、错误信息归一化的行为完全一致。
 */

export const REQUEST_TIMEOUT_MS = 120000;

/**
 * 把用户填写的 Base URL 规范化为 chat/completions 端点。
 * 兼容三种常见写法：
 * - 完整端点 .../chat/completions        -> 原样使用
 * - 带版本号的基础地址 .../v1、.../v4    -> 追加 /chat/completions
 * - 纯域名 https://api.example.com       -> 追加 /v1/chat/completions
 */
export function resolveEndpoint(apiUrl: string): string {
  const url = apiUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(url)) return url;
  if (/\/v\d+$/.test(url)) return `${url}/chat/completions`;
  return `${url}/v1/chat/completions`;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: unknown;
}

export interface ChatCompletionParams {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /**
   * 显式关闭思考模式。智谱等平台通过 `thinking: { type: 'disabled' }` 控制，
   * 关闭后输出更短更稳定，适合「只提取不生成」这类要求确定性的任务。
   */
  disableThinking?: boolean;
  timeoutMs?: number;
}

/** 从响应中取出正文：兼容部分推理模型把正文放在 reasoning_content 的情况 */
function pickContent(parsed: any): string {
  const message = parsed?.choices?.[0]?.message || {};
  const text = message.content ?? message.reasoning_content ?? parsed?.content;
  return typeof text === 'string' ? text.trim() : '';
}

/**
 * 发起一次 chat/completions 请求，直接返回模型输出的正文文本。
 * 所有网络层与协议层异常都在这里转成可直接展示给用户的中文错误。
 */
export async function requestChatCompletion(params: ChatCompletionParams): Promise<string> {
  const { apiUrl, apiKey, model, messages, temperature, disableThinking, timeoutMs } = params;

  if (!apiUrl || !apiKey) {
    throw new Error('未配置 API 地址或密钥，请在「模型设置」中填写');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(resolveEndpoint(apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: false,
        ...(disableThinking ? { thinking: { type: 'disabled' } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      throw new Error(`模型请求超时（超过 ${(timeoutMs ?? REQUEST_TIMEOUT_MS) / 1000} 秒）`);
    }
    // 浏览器端跨域失败通常表现为 TypeError: Failed to fetch，这里给出可操作的排查提示
    throw new Error(`模型请求失败：${(err as Error).message}（若为跨域错误，需该接口允许浏览器直连）`);
  }

  clearTimeout(timer);

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`模型服务返回 ${response.status}：${rawText.slice(0, 300)}`);
  }

  let content: string;
  try {
    content = pickContent(JSON.parse(rawText));
  } catch {
    throw new Error('模型服务返回内容不是合法 JSON');
  }

  if (!content) throw new Error('模型未返回内容');
  return content;
}
