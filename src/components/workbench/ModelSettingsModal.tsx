import { useEffect, useRef, useState } from 'react';
import { Modal, Form, Input, Button, message, Switch, Collapse, Select, Popconfirm } from '@/vendor/mtd-react3';
import type { ModelSettings, PromptTemplates, ModelProfile } from '@/types';
import { DEFAULT_PROMPT_TEMPLATES, resolvePromptTemplates } from '@/lib/llm/promptSchemas';

interface ModelSettingsModalProps {
  open: boolean;
  profiles: ModelProfile[];
  activeProfileId: string;
  onClose: () => void;
  /** 把当前表单内容保存进「当前激活配置」 */
  onSaveActive: (settings: ModelSettings) => void;
  /** 另存为一套带名字的新配置 */
  onSaveNew: (name: string, settings: ModelSettings) => void;
  /** 删除某套配置（内置默认不可删） */
  onDelete: (id: string) => void;
  /** 重命名某套配置（内置默认不可改） */
  onRename: (id: string, name: string) => void;
  /** 在下拉列表中切换激活配置（立即系统级生效） */
  onSelectProfile: (id: string) => void;
}

/** 可编辑的 Prompt 模板项：coreRules 是公共前缀，会注入到其余三个生成模板 */
const PROMPT_FIELDS: Array<{ key: keyof PromptTemplates; label: string; hint: string }> = [
  {
    key: 'coreRules',
    label: '方法论核心规则（公共前缀）',
    hint: '会注入到下方三个生成模板的 {{coreRules}} 位置，改动会同时影响全部生成节点',
  },
  { key: 'jdAnalysis', label: 'JD 解析', hint: '节点①：把 JD 文本拆解为结构化字段' },
  { key: 'jdMatching', label: '经历匹配', hint: '节点②：JD 要求与个人经历逐条比对' },
  { key: 'generation', label: '内容生成', hint: '节点③④：按 JD 改写包装经历，输出简历版 / STAR 版' },
  { key: 'visionExtraction', label: '图片内容提取', hint: '仅供视觉模型使用，只提取不生成' },
];

const cardInner = {
  background: 'var(--bg-card-inner)',
  borderRadius: 'var(--radius-3)',
} as const;

export default function ModelSettingsModal({
  open,
  profiles,
  activeProfileId,
  onClose,
  onSaveActive,
  onSaveNew,
  onDelete,
  onRename,
  onSelectProfile,
}: ModelSettingsModalProps) {
  const formRef = useRef<any>(null);
  const [useLlm, setUseLlm] = useState(true);
  const [prompts, setPrompts] = useState<PromptTemplates>(() => resolvePromptTemplates(null));
  // 命名输入模式：none / 另存为新配置 / 重命名
  const [nameMode, setNameMode] = useState<'none' | 'new' | 'rename'>('none');
  const [nameDraft, setNameDraft] = useState('');

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  const isBuiltin = Boolean(activeProfile?.builtin);

  // 打开弹框或切换激活配置时，把该配置的内容载入表单
  useEffect(() => {
    if (open && activeProfile) {
      formRef.current?.setFieldsValue(activeProfile.settings);
      setUseLlm(activeProfile.settings.useLlm);
      setPrompts(resolvePromptTemplates(activeProfile.settings.prompts));
      setNameMode('none');
      setNameDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeProfileId]);

  const buildSettings = (): ModelSettings => {
    const values = formRef.current?.getFieldsValue() || {};
    return {
      // 内置预设锁死 API 地址，避免误改破坏智谱连接
      apiUrl: isBuiltin ? activeProfile?.settings.apiUrl || '' : values.apiUrl?.trim() || '',
      apiKey: values.apiKey?.trim() || '',
      textModel: values.textModel?.trim() || '',
      visionModel: values.visionModel?.trim() || '',
      useLlm,
      prompts,
    };
  };

  const handleSaveActive = () => {
    if (useLlm) {
      const valid = formRef.current?.validateFields();
      if (!valid) return;
    }
    onSaveActive(buildSettings());
    message.success({ message: `已保存到「${activeProfile?.name ?? ''}」` });
    onClose();
  };

  const handleSaveNew = () => {
    const name = nameDraft.trim();
    if (!name) {
      message.warning({ message: '请先给新配置起个名字' });
      return;
    }
    if (useLlm) {
      const valid = formRef.current?.validateFields();
      if (!valid) return;
    }
    onSaveNew(name, buildSettings());
    setNameMode('none');
    setNameDraft('');
    message.success({ message: `已另存为「${name}」` });
    onClose();
  };

  const handleRename = () => {
    const name = nameDraft.trim();
    if (!name) {
      message.warning({ message: '名字不能为空' });
      return;
    }
    onRename(activeProfile.id, name);
    setNameMode('none');
    setNameDraft('');
    message.success({ message: '已重命名' });
  };

  const resetPrompt = (key: keyof PromptTemplates) => {
    setPrompts((prev) => ({ ...prev, [key]: DEFAULT_PROMPT_TEMPLATES[key] }));
    message.success({ message: '已恢复该项默认模板' });
  };

  const resetAllPrompts = () => {
    setPrompts(resolvePromptTemplates(null));
    message.success({ message: '已恢复全部默认模板' });
  };

  return (
    <Modal open={open} title="模型设置" onClose={onClose} style={{ width: 580 }} icon="setting">
      <Modal.Body>
        {/* 配置下拉 + 命名管理 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
            padding: '10px 12px',
            ...cardInner,
          }}
        >
          <span style={{ fontSize: 'var(--fs-13)', color: 'var(--text-2)', flexShrink: 0 }}>模型配置</span>
          <Select
            value={activeProfileId}
            onChange={(id: string) => onSelectProfile(id)}
            clearable={false}
            onlyKeyValue
            style={{ flex: 1, minWidth: 0 }}
          >
            {profiles.map((p) => (
              <Select.Option key={p.id} value={p.id}>
                {p.name}
                {p.builtin ? ' · 内置' : ''}
              </Select.Option>
            ))}
          </Select>
          <Button size="small" onClick={() => { setNameMode('new'); setNameDraft(''); }}>
            另存为新配置
          </Button>
          <Button
            size="small"
            disabled={isBuiltin}
            onClick={() => { setNameMode('rename'); setNameDraft(activeProfile?.name ?? ''); }}
          >
            重命名
          </Button>
          <Popconfirm
            message="确定删除该配置？删除后无法恢复（内置默认配置不可删）。"
            onOk={() => onDelete(activeProfile.id)}
          >
            <Button size="small" disabled={isBuiltin} type="danger">
              删除
            </Button>
          </Popconfirm>
        </div>

        {nameMode === 'new' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Input
              autoFocus
              placeholder="给新配置起个名字，如：GPT 配置 / 公司账号"
              value={nameDraft}
              onChange={(e: any) => setNameDraft(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button size="small" type="primary" onClick={handleSaveNew}>
              确定保存
            </Button>
            <Button size="small" onClick={() => { setNameMode('none'); setNameDraft(''); }}>
              取消
            </Button>
          </div>
        )}

        {nameMode === 'rename' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Input
              autoFocus
              placeholder="输入新名称"
              value={nameDraft}
              onChange={(e: any) => setNameDraft(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button size="small" type="primary" onClick={handleRename}>
              确定
            </Button>
            <Button size="small" onClick={() => { setNameMode('none'); setNameDraft(''); }}>
              取消
            </Button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
            padding: '10px 12px',
            ...cardInner,
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-1)', fontWeight: 'var(--fw-medium)' }}>
              启用大模型解析
            </div>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginTop: 2 }}>
              关闭时使用规则引擎，开启后按下方配置调用大模型（调用失败会自动降级为规则引擎）
            </div>
          </div>
          <Switch checked={useLlm} onChange={(e: any) => setUseLlm(e.target.checked)} />
        </div>

        {useLlm && (
          <Form ref={formRef} labelPosition="top" defaultFieldsValue={activeProfile?.settings}>
            <Form.Item
              formItemKey="apiUrl"
              label="API 地址（Base URL）"
              required
              rules={{ required: true, message: '请输入 API 地址' }}
            >
              <Input
                placeholder="如：https://open.bigmodel.cn/api/paas/v4"
                toFormItem
                disabled={isBuiltin}
              />
            </Form.Item>
            {isBuiltin && (
              <div
                style={{
                  fontSize: 'var(--fs-12)',
                  color: 'var(--text-4)',
                  marginTop: -10,
                  marginBottom: 16,
                  lineHeight: '18px',
                }}
              >
                内置预设已锁定该地址（智谱开放平台），不可修改；你可自行调整下方「密钥」与「模型名称」。
              </div>
            )}
            <Form.Item
              formItemKey="apiKey"
              label="API 密钥"
              required
              rules={{ required: true, message: '请输入 API 密钥' }}
            >
              <Input.Password placeholder="请输入密钥" toFormItem />
            </Form.Item>
            <Form.Item
              formItemKey="textModel"
              label="文本模型（生成唯一出口）"
              required
              rules={{ required: true, message: '请输入文本模型名称' }}
            >
              <Input placeholder="如：glm-4.7-flash" toFormItem />
            </Form.Item>
            <Form.Item
              formItemKey="visionModel"
              label="视觉模型（仅用于图片提取）"
              rules={{ required: false }}
            >
              <Input placeholder="如：glm-4.6v-flash，仅在上传图片时才调用" toFormItem />
            </Form.Item>
          </Form>
        )}

        {useLlm && (
          <div
            style={{
              padding: '10px 12px',
              ...cardInner,
              fontSize: 'var(--fs-12)',
              color: 'var(--text-4)',
              lineHeight: '20px',
              marginBottom: 16,
            }}
          >
            接口需为 OpenAI 兼容的 <code>/chat/completions</code> 格式，系统会自动拼接端点。
            浏览器将直连该接口，因此需要服务端允许跨域（CORS）；否则会调用失败并降级为规则引擎。
            职责划分：<b>视觉模型只负责把图片转成文字，所有生成任务一律由文本模型完成</b>。
          </div>
        )}

        {useLlm && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--text-2)' }}>Prompt 模板（高级）</div>
              <Button size="small" onClick={resetAllPrompts}>
                全部恢复默认
              </Button>
            </div>
            <Collapse type="simple">
              {PROMPT_FIELDS.map((field) => (
                <Collapse.Item key={field.key} code={field.key} title={field.label}>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--text-4)', marginBottom: 8, lineHeight: '20px' }}>
                    {field.hint}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <Button size="small" onClick={() => resetPrompt(field.key)}>
                      恢复此项默认
                    </Button>
                  </div>
                  <Input.TextArea
                    value={prompts[field.key]}
                    onChange={(e: any) =>
                      setPrompts((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    rows={10}
                    style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
                  />
                </Collapse.Item>
              ))}
            </Collapse>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={onClose} style={{ marginRight: 12 }}>
          取消
        </Button>
        <Button type="primary" onClick={handleSaveActive}>
          保存到当前配置
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
