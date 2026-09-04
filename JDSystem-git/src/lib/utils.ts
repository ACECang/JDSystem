import type { TaskStatus } from '@/types';
import { TASK_STATUS_LIST } from '@/types';

/** 任务状态 -> MTD Tag theme 映射（Tag 仅支持这些主题色，teal/purple 等需映射到最接近色） */
const STATUS_TAG_THEME: Record<TaskStatus, string> = {
  pending: 'gray',
  generated: 'blue',
  ready: 'purple',
  delivered: 'orange',
  interviewing: 'brown',
  offer: 'green',
  rejected: 'red',
};

export function getStatusTheme(status: TaskStatus): string {
  return STATUS_TAG_THEME[status] ?? 'gray';
}

export function getStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LIST.find((s) => s.value === status)?.label ?? status;
}

/** 格式化日期为 "MM月DD日" 用于分组标题 */
export function formatDateGroup(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (isSameDay(d, today)) return '今天';
  if (isSameDay(d, yesterday)) return '昨天';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 格式化为 "MM-DD HH:mm" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 复制文本到剪贴板 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** 读取图片文件为 base64 dataURL（本地存储，无真实上传） */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
