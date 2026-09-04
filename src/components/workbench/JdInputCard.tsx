import { useRef, useState } from 'react';
import { Button, Input, Icon, message } from '@/vendor/mtd-react3';
import type { JobTask, ModelSettings } from '@/types';
import { normalizeInput } from '@/lib/llm/inputRouter';

interface JdInputCardProps {
  task: JobTask;
  settings: ModelSettings;
  onChange: (patch: Partial<JobTask>) => void;
  /** 传入已归一化的文本；不传则回退使用 task.jdText */
  onAnalyze: (jdText?: string) => void;
  analyzing: boolean;
}

interface PickedImage {
  file: File;
  /** 本地预览用的 object URL，移除时需要 revoke 以免内存泄漏 */
  url: string;
}

export default function JdInputCard({ task, settings, onChange, onAnalyze, analyzing }: JdInputCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const picked = files.filter((f) => f.type.startsWith('image/'));
    if (picked.length === 0) {
      message.error({ message: '请选择图片文件' });
      return;
    }
    setImages((prev) => [...prev, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    // 清空 input，保证同一张图可以被重复选择
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleAnalyze = async () => {
    const text = task.jdText.trim();

    if (!text && images.length === 0) {
      message.error({ message: '请粘贴 JD 文本，或上传 JD 截图自动识别' });
      return;
    }

    // 纯文字：直接走生成链路，不产生任何视觉模型调用
    if (images.length === 0) {
      onAnalyze();
      return;
    }

    // 含图片：先经 InputRouter 归一化（图片 → 文字），再交给生成模块
    setExtracting(true);
    setProgress({ done: 0, total: images.length });
    try {
      const normalized = await normalizeInput(
        { text, images: images.map((i) => i.file) },
        settings,
        { onImageDone: (done, total) => setProgress({ done, total }) },
      );
      onChange({ jdText: normalized });
      images.forEach((i) => URL.revokeObjectURL(i.url));
      setImages([]);
      message.success({ message: '图片内容已提取并填入文本框，可在此直接修改' });
      onAnalyze(normalized);
    } catch (err) {
      message.error({ message: `图片识别失败：${(err as Error).message}` });
    } finally {
      setExtracting(false);
      setProgress(null);
    }
  };

  const busy = extracting || analyzing;

  return (
    <div className="dash-card" style={{ marginBottom: 'var(--gap-module)' }}>
      <div className="card-title-bar">
        <div className="dash-title">JD 输入</div>
        {images.length > 0 && (
          <Button size="small" icon="add" onClick={handleFileClick} disabled={busy}>
            继续添加图片
          </Button>
        )}
      </div>

      <Input.TextArea
        value={task.jdText}
        onChange={(e) => onChange({ jdText: (e.target as HTMLTextAreaElement).value })}
        placeholder="请粘贴职位描述（JD）文本内容；也可以只上传 JD 截图，系统会自动识别图片中的文字后一并解析..."
        rows={8}
        showCount
        maxLength={5000}
        style={{ width: '100%' }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {images.length === 0 ? (
        <div
          onClick={busy ? undefined : handleFileClick}
          style={{
            marginTop: 12,
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-4)',
            padding: '20px 16px',
            textAlign: 'center',
            cursor: busy ? 'not-allowed' : 'pointer',
            background: 'var(--bg-card-inner)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Icon type="upload-cloud-o" style={{ fontSize: 24, color: 'var(--text-4)' }} />
          <div style={{ marginTop: 6, color: 'var(--text-3)', fontSize: 'var(--fs-14)' }}>
            点击上传 JD 截图（支持多张），自动识别文字后与上方文本合并解析
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {images.map((img, idx) => (
              <div
                key={img.url}
                style={{
                  position: 'relative',
                  width: 96,
                  height: 96,
                  borderRadius: 'var(--radius-4)',
                  overflow: 'hidden',
                  border: '1px solid var(--border)',
                }}
              >
                <img
                  src={img.url}
                  alt={`JD截图${idx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  onClick={() => !busy && removeImage(idx)}
                  title="移除"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Icon type="close" style={{ fontSize: 11, color: '#fff' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 'var(--fs-12)', color: 'var(--text-4)' }}>
            已选 {images.length} 张图片，将在点击「解析 JD」时先识别文字，再与上方文本合并解析。
          </div>
        </div>
      )}

      {extracting && (
        <div style={{ marginTop: 10, fontSize: 'var(--fs-12)', color: 'var(--color-brand-primary)' }}>
          正在识别图片内容 {progress ? `${progress.done}/${progress.total}` : ''}...
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          type="primary"
          icon="refresh-o"
          loading={busy}
          disabled={busy || (!task.jdText.trim() && images.length === 0)}
          onClick={handleAnalyze}
        >
          {analyzing ? '解析中...' : extracting ? '识别中...' : '解析 JD'}
        </Button>
      </div>
    </div>
  );
}
