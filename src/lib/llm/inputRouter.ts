/**
 * 输入判断模块 InputRouter。
 *
 * 把「文字 / 图片 / 图文混合」三种输入统一归一化成一段纯文本，
 * 再交给下游唯一的生成出口 TextGenerator 处理。
 *
 * 分流规则：
 * - 无图片：原文直接透传，不产生任何模型调用（省时省钱）；
 * - 有图片：逐张调用 VisionExtractor 转成文字描述，再与用户补充的文字**分段标注**合并，
 *   标注来源是为了让下游模型能区分「图片里写的」与「用户自己补的」。
 *
 * 多图场景：VisionExtractor 串行执行。
 * 串行而非并发，是为了避免并发请求打满导致部分图片失败、却又已经扣费，
 * 同时便于 UI 逐张反馈进度。
 */

import { extractImageText } from './visionExtractor';
import type { ModelSettings } from '@/types';

export interface RawInput {
  text: string;
  images: File[];
}

export interface NormalizeOptions {
  /** 每处理完一张图片回调一次，供 UI 显示进度 */
  onImageDone?: (done: number, total: number) => void;
}

export function hasImages(input: RawInput): boolean {
  return (input.images?.length ?? 0) > 0;
}

/** 判断是否会触发视觉模型调用，供 UI 提示用户 */
export function willUseVision(input: RawInput): boolean {
  return hasImages(input);
}

/**
 * 归一化输入为一段纯文本。
 *
 * 输出格式（含图片时）：
 * 【图片 1 内容】
 * …
 * 【图片 2 内容】
 * …
 * 【补充文字】
 * …
 */
export async function normalizeInput(
  input: RawInput,
  settings: ModelSettings,
  options: NormalizeOptions = {},
): Promise<string> {
  const text = (input.text ?? '').trim();

  // 纯文字：直接透传
  if (!hasImages(input)) return text;

  const blocks: string[] = [];
  const images = input.images;

  for (let i = 0; i < images.length; i++) {
    const description = await extractImageText(images[i], settings);
    blocks.push(`【图片 ${i + 1} 内容】\n${description.trim()}`);
    options.onImageDone?.(i + 1, images.length);
  }

  if (text) {
    blocks.push(`【补充文字】\n${text}`);
  }

  return blocks.join('\n\n');
}
