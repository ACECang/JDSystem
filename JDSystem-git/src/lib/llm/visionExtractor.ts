/**
 * 图片理解模块 VisionExtractor。
 *
 * 职责边界（关键）：只把图片「说了什么」如实转成文字，
 * 不做结构化、不做判断、不产出 JSON——所有生成决策统一交给 TextGenerator。
 * 这样最终输出只受一个模型、一套协议约束，行为可预期、可单独调试。
 *
 * 为追求提取稳定性，这里固定低温并显式关闭思考模式。
 */

import { readFileAsDataURL } from '@/lib/utils';
import { resolvePromptTemplates } from './promptSchemas';
import { requestChatCompletion } from './http';
import type { ModelSettings } from '@/types';

/** 提取任务要求确定性，温度压到最低 */
const EXTRACTION_TEMPERATURE = 0.1;

/**
 * 把一张图片转成通用文字描述。
 * @throws 未配置视觉模型 / 网络失败 / 模型未返回内容
 */
export async function extractImageText(file: File, settings: ModelSettings): Promise<string> {
  const { apiUrl, apiKey, visionModel } = settings;

  if (!visionModel) {
    throw new Error('未配置视觉模型名称，请在「模型设置」中填写（用于图片内容提取）');
  }

  const dataUrl = await readFileAsDataURL(file);
  const prompt = resolvePromptTemplates(settings.prompts).visionExtraction;

  const text = await requestChatCompletion({
    apiUrl,
    apiKey,
    model: visionModel,
    temperature: EXTRACTION_TEMPERATURE,
    disableThinking: true,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  if (!text) throw new Error('图片内容提取未返回有效文字');
  return text;
}
