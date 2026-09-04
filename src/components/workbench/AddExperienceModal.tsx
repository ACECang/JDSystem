import { useRef } from 'react';
import { Modal, Form, Input, Select, Button, message } from '@/vendor/mtd-react3';

export type AddExperienceType = 'internship' | 'project' | 'skill' | null;

interface AddExperienceModalProps {
  type: AddExperienceType;
  onClose: () => void;
  onConfirmInternship: (data: {
    company: string;
    role: string;
    period: string;
    description: string;
    highlights: string[];
  }) => void;
  onConfirmProject: (data: {
    name: string;
    role: string;
    period: string;
    description: string;
    techStack: string[];
    highlights: string[];
  }) => void;
  onConfirmSkill: (data: { name: string; category: string; level: 'basic' | 'proficient' | 'expert' }) => void;
}

function splitTags(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AddExperienceModal({
  type,
  onClose,
  onConfirmInternship,
  onConfirmProject,
  onConfirmSkill,
}: AddExperienceModalProps) {
  const formRef = useRef<any>(null);

  const handleClose = () => {
    formRef.current?.reset();
    onClose();
  };

  const handleOk = () => {
    const valid = formRef.current?.validateFields();
    if (!valid) return;
    const values = formRef.current?.getFieldsValue();

    if (type === 'internship') {
      onConfirmInternship({
        company: values.company.trim(),
        role: values.role.trim(),
        period: values.period?.trim() || '',
        description: values.description?.trim() || '',
        highlights: splitTags(values.highlights),
      });
    } else if (type === 'project') {
      onConfirmProject({
        name: values.name.trim(),
        role: values.role?.trim() || '',
        period: values.period?.trim() || '',
        description: values.description?.trim() || '',
        techStack: splitTags(values.techStack),
        highlights: splitTags(values.highlights),
      });
    } else if (type === 'skill') {
      onConfirmSkill({
        name: values.name.trim(),
        category: values.category?.trim() || '其他',
        level: values.level || 'basic',
      });
    }
    formRef.current?.reset();
    message.success({ message: '已添加' });
  };

  const titleMap: Record<string, string> = {
    internship: '新增实习经历',
    project: '新增项目经历',
    skill: '新增技能',
  };

  return (
    <Modal open={!!type} title={type ? titleMap[type] : ''} onClose={handleClose} style={{ width: 480 }}>
      <Modal.Body>
        <Form ref={formRef} labelPosition="top">
          {type === 'internship' && (
            <>
              <Form.Item formItemKey="company" label="公司名称" required rules={{ required: true, message: '请输入公司名称' }}>
                <Input placeholder="如：美团点评" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="role" label="职位" required rules={{ required: true, message: '请输入职位' }}>
                <Input placeholder="如：前端开发实习生" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="period" label="实习周期">
                <Input placeholder="如：2023.07 - 2023.09" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="description" label="经历描述">
                <Input.TextArea placeholder="请描述具体工作内容与成果" rows={4} toFormItem />
              </Form.Item>
              <Form.Item formItemKey="highlights" label="关键亮点（逗号分隔）">
                <Input placeholder="如：性能优化,组件库建设" toFormItem />
              </Form.Item>
            </>
          )}

          {type === 'project' && (
            <>
              <Form.Item formItemKey="name" label="项目名称" required rules={{ required: true, message: '请输入项目名称' }}>
                <Input placeholder="如：智能简历匹配小工具" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="role" label="担任角色">
                <Input placeholder="如：前端负责人" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="period" label="项目周期">
                <Input placeholder="如：2024.03 - 2024.06" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="description" label="项目描述">
                <Input.TextArea placeholder="请描述项目背景、职责与成果" rows={4} toFormItem />
              </Form.Item>
              <Form.Item formItemKey="techStack" label="技术栈（逗号分隔）">
                <Input placeholder="如：React,TypeScript,Node.js" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="highlights" label="关键亮点（逗号分隔）">
                <Input placeholder="如：独立开发,性能提升50%" toFormItem />
              </Form.Item>
            </>
          )}

          {type === 'skill' && (
            <>
              <Form.Item formItemKey="name" label="技能名称" required rules={{ required: true, message: '请输入技能名称' }}>
                <Input placeholder="如：TypeScript" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="category" label="分类">
                <Input placeholder="如：编程语言" toFormItem />
              </Form.Item>
              <Form.Item formItemKey="level" label="掌握程度">
                <Select placeholder="请选择掌握程度" toFormItem>
                  <Select.Option value="basic">了解</Select.Option>
                  <Select.Option value="proficient">熟练</Select.Option>
                  <Select.Option value="expert">精通</Select.Option>
                </Select>
              </Form.Item>
            </>
          )}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={handleClose} style={{ marginRight: 12 }}>
          取消
        </Button>
        <Button type="primary" onClick={handleOk}>
          确定
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
