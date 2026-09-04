import { useRef } from 'react';
import { Modal, Form, Input, Button, message } from '@/vendor/mtd-react3';

interface AddTaskModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { title: string; company: string }) => void;
}

export default function AddTaskModal({ open, onClose, onConfirm }: AddTaskModalProps) {
  const formRef = useRef<any>(null);

  const handleOk = () => {
    const valid = formRef.current?.validateFields();
    if (!valid) return;
    const values = formRef.current?.getFieldsValue();
    onConfirm({ title: values.title.trim(), company: values.company?.trim() || '' });
    formRef.current?.reset();
    message.success({ message: '已新增岗位任务' });
  };

  const handleClose = () => {
    formRef.current?.reset();
    onClose();
  };

  return (
    <Modal open={open} title="新增岗位任务" onClose={handleClose} style={{ width: 420 }}>
      <Modal.Body>
        <Form ref={formRef} labelPosition="top">
          <Form.Item formItemKey="title" label="岗位名称" required rules={{ required: true, message: '请输入岗位名称' }}>
            <Input placeholder="如：前端开发工程师" toFormItem />
          </Form.Item>
          <Form.Item formItemKey="company" label="公司名称">
            <Input placeholder="如：美团" toFormItem />
          </Form.Item>
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
