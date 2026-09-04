/**
 * UI 组件层
 *
 * 本项目原依赖一个仅在内网发布的私有组件库（公共 npm 与各镜像源均不可获取）。
 * 这里用 React + 项目已有的设计 Token（src/styles/tokens.css）复刻业务代码实际用到的
 * 18 个组件与 API，使系统在任意网络环境下都能正常运行。
 *
 * 设计原则：
 * - 只对齐业务代码真实用到的 props，不追求面面俱到；
 * - 视觉统一走 tokens.css 的 CSS 变量，保证风格一致；
 * - 业务代码统一从 '@/vendor/mtd-react3' 引入。
 */

import React, {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Folder,
  Globe,
  Inbox,
  Info,
  Link as LinkIcon,
  List,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Star,
  Tag as TagIcon,
  Trash2,
  UploadCloud,
  User,
  X,
} from 'lucide-react';

// ==================== 图标 ====================

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  briefcase: Briefcase,
  'folder-fill': Folder,
  setting: Settings,
  'refresh-o': RefreshCw,
  delete: Trash2,
  'upload-cloud-o': UploadCloud,
  'link-o': LinkIcon,
  add: Plus,
  edit: Pencil,
  copy: Copy,
  save: Save,
  globe: Globe,
  top: ArrowUp,
  'warning-o': AlertTriangle,
  'warning-circle-o': AlertCircle,
  'info-o': Info,
  'list-view': List,
  'avatar-fill': User,
  star: Star,
  tag: TagIcon,
  search: Search,
  close: X,
  down: ChevronDown,
  right: ChevronRight,
};

export const Icon = ({ type, style, onClick, className }: any) => {
  const Cmp = ICON_MAP[type] || Inbox;
  const size = typeof style?.fontSize === 'number' ? style.fontSize : parseInt(String(style?.fontSize || 14), 10) || 14;
  return <Cmp size={size} className={className} style={style} onClick={onClick} />;
};

// ==================== 全局 message 提示 ====================

const TOAST_COLOR: Record<string, string> = {
  success: '#00a854',
  error: '#ff1f1f',
  warning: '#ff7700',
  info: '#1a3b7a',
};

let toastHost: HTMLDivElement | null = null;

function ensureToastHost(): HTMLDivElement {
  if (toastHost && document.body.contains(toastHost)) return toastHost;
  toastHost = document.createElement('div');
  toastHost.style.cssText =
    'position:fixed;top:16px;left:0;right:0;z-index:10000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
  document.body.appendChild(toastHost);
  return toastHost;
}

function showToast(type: string, opts: any) {
  if (typeof window === 'undefined') return;
  const text = typeof opts === 'string' ? opts : String(opts?.message ?? '');
  const host = ensureToastHost();
  const el = document.createElement('div');
  el.style.cssText =
    `pointer-events:auto;max-width:76vw;padding:9px 14px;border-radius:6px;background:#fff;` +
    `box-shadow:0 8px 24px rgba(0,0,0,0.12);font-size:13px;line-height:20px;color:var(--text-1);` +
    `border-left:3px solid ${TOAST_COLOR[type] || TOAST_COLOR.info};transition:opacity .2s;`;
  el.textContent = text;
  host.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 220);
  }, 2600);
}

export const message = {
  success: (o: any) => showToast('success', o),
  error: (o: any) => showToast('error', o),
  warning: (o: any) => showToast('warning', o),
  info: (o: any) => showToast('info', o),
};

// ==================== 基础组件 ====================

export const ConfigProvider = ({ children }: any) => <>{children}</>;

export const Button = ({
  children,
  type,
  size,
  icon,
  shape,
  loading,
  disabled,
  onClick,
  style,
  ...rest
}: any) => {
  const isPrimary = type === 'primary';
  const isText = shape === 'text';
  const isSmall = size === 'small';
  const iconSize = isSmall ? 12 : 14;

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: isSmall ? 26 : 32,
    padding: isSmall ? '0 10px' : '0 14px',
    fontSize: isSmall ? 12 : 14,
    fontWeight: 500,
    fontFamily: 'inherit',
    borderRadius: 'var(--radius-3)',
    border: '1px solid transparent',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'all .15s',
    whiteSpace: 'nowrap',
    ...(isText
      ? { background: 'transparent', color: 'inherit', padding: isSmall ? '0 6px' : '0 8px' }
      : isPrimary
        ? { background: 'var(--color-brand-primary)', color: '#fff', borderColor: 'var(--color-brand-primary)' }
        : { background: 'var(--bg-card)', color: 'var(--text-1)', borderColor: 'var(--border)' }),
    ...style,
  };

  return (
    <button type="button" style={base} disabled={disabled || loading} onClick={onClick} {...rest}>
      {loading ? (
        <Loader2 size={iconSize} className="mtd-spin" />
      ) : icon ? (
        <Icon type={icon} style={{ fontSize: iconSize }} />
      ) : null}
      {children}
    </button>
  );
};

// ==================== 表单上下文（Form / Form.Item / toFormItem 联动） ====================

const FormContext = createContext<any>(null);
const ItemContext = createContext<{ key?: string } | null>(null);

/** 供 Input / Select 等表单控件读取：若带 toFormItem 则与 Form 仓库双向绑定，否则回退为普通受控用法 */
function useBoundValue(props: any) {
  const item = useContext(ItemContext);
  const form = useContext(FormContext);
  const key = props.toFormItem && item?.key ? item.key : undefined;
  const error = key && form ? form.getError(key) : undefined;

  const value = key && form ? form.get(key) : props.value;

  const setValue = (v: any) => {
    if (key && form) form.set(key, v);
    if (props.onChange) props.onChange({ target: { value: v } });
  };

  return { value: value ?? '', setValue, error };
}

// ==================== Input ====================

const inputBase: React.CSSProperties = {
  width: '100%',
  height: 32,
  padding: '0 10px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'var(--text-1)',
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-3)',
  outline: 'none',
  boxSizing: 'border-box',
};

const InputRoot = (props: any) => {
  const { toFormItem, type, prefix, style, disabled, placeholder, onBlur, maxLength, ...rest } = props;
  const { value, setValue } = useBoundValue(props);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {prefix && (
        <span
          style={{
            position: 'absolute',
            left: 9,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            color: 'var(--text-4)',
          }}
        >
          <Icon type={prefix} style={{ fontSize: 14 }} />
        </span>
      )}
      <input
        {...rest}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onBlur={onBlur}
        onChange={(e) => setValue(e.target.value)}
        style={{ ...inputBase, paddingLeft: prefix ? 30 : 10, ...style }}
      />
    </div>
  );
};

const Password = (props: any) => {
  const [visible, setVisible] = useState(false);
  const { style, ...rest } = props;
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <InputRoot {...rest} type={visible ? 'text' : 'password'} style={{ ...style, paddingRight: 34 }} />
      <span
        onClick={() => setVisible((v) => !v)}
        style={{
          position: 'absolute',
          right: 9,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          cursor: 'pointer',
          color: 'var(--text-4)',
        }}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </span>
    </div>
  );
};

const TextArea = (props: any) => {
  const { rows = 4, showCount, maxLength, style, onBlur, placeholder, disabled, ...rest } = props;
  const { value, setValue } = useBoundValue(props);
  return (
    <div style={{ width: '100%' }}>
      <textarea
        {...rest}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onBlur={onBlur}
        onChange={(e) => setValue(e.target.value)}
        style={{
          ...inputBase,
          height: 'auto',
          padding: '8px 10px',
          lineHeight: '20px',
          resize: 'vertical',
          ...style,
        }}
      />
      {showCount && (
        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-4)', marginTop: 2 }}>
          {String(value ?? '').length}
          {maxLength ? `/${maxLength}` : ''}
        </div>
      )}
    </div>
  );
};

const SearchInput = (props: any) => <InputRoot {...props} prefix="search" />;

export const Input: any = InputRoot;
Input.Password = Password;
Input.TextArea = TextArea;
Input.Search = SearchInput;

// ==================== Form ====================

export const Form: any = React.forwardRef((props: any, ref: any) => {
  const { children, defaultFieldsValue, style } = props;
  // 用 useState 持有表单值（而非 useRef），这样每次 set 都会创建新的 store 对象，
  // 进而让下方 useMemo 重建 api、FormContext.Provider 的 value 引用随之变化，
  // 所有通过 useContext(FormContext) 订阅的 Input/Select 才会被通知重渲染、回显最新输入。
  // 之前用 useRef + useReducer(bump) 透传 children：bump 重渲染时 children 元素引用未变，
  // React 会跳过该子树；api 又因 useMemo([errorMap]) 缓存同一引用，context 也不通知消费者，
  // 导致受控输入框的值永远停在初始空值（但底层 store 其实已写入，提交仍能成功）。
  const [store, setStore] = useState<Record<string, any>>({ ...(defaultFieldsValue || {}) });
  const rulesRef = useRef<Map<string, any>>(new Map());
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const api = useMemo(
    () => ({
      get: (k: string) => store[k],
      set: (k: string, v: any) => {
        setStore((prev) => ({ ...prev, [k]: v }));
      },
      getError: (k: string) => errorMap[k],
      register: (k: string, rules: any) => {
        rulesRef.current.set(k, rules);
      },
      unregister: (k: string) => {
        rulesRef.current.delete(k);
      },
    }),
    [store, errorMap],
  );

  useImperativeHandle(ref, () => ({
    setFieldsValue: (obj: any) => {
      setStore((prev) => ({ ...prev, ...(obj || {}) }));
    },
    getFieldsValue: () => ({ ...store }),
    validateFields: () => {
      const errs: Record<string, string> = {};
      rulesRef.current.forEach((rules, k) => {
        if (rules?.required) {
          const v = store[k];
          if (v === undefined || v === null || String(v).trim() === '') {
            errs[k] = rules.message || '该项为必填';
          }
        }
      });
      setErrorMap(errs);
      return Object.keys(errs).length === 0;
    },
    reset: () => {
      setStore({ ...(defaultFieldsValue || {}) });
      setErrorMap({});
    },
  }), [store, defaultFieldsValue]);

  return (
    <FormContext.Provider value={api}>
      <div style={style}>{children}</div>
    </FormContext.Provider>
  );
});

Form.Item = ({ formItemKey, label, required, rules, children, style }: any) => {
  const form = useContext(FormContext);
  useEffect(() => {
    if (form && formItemKey) form.register(formItemKey, rules);
    return () => {
      if (form && formItemKey) form.unregister(formItemKey);
    };
  }, [formItemKey, form]);

  const error = form?.getError?.(formItemKey);

  return (
    <div style={{ marginBottom: 16, ...style }}>
      {label && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
          {required && <span style={{ color: 'var(--color-red)', marginRight: 3 }}>*</span>}
          {label}
        </div>
      )}
      <ItemContext.Provider value={{ key: formItemKey }}>{children}</ItemContext.Provider>
      {error && <div style={{ fontSize: 12, color: 'var(--color-red)', marginTop: 4 }}>{error}</div>}
    </div>
  );
};

// ==================== Select ====================

const SelectRoot = (props: any) => {
  const { value, onChange, placeholder, style, size, disabled, children, toFormItem } = props;
  const item = useContext(ItemContext);
  const form = useContext(FormContext);
  const key = toFormItem && item?.key ? item.key : undefined;
  const current = key && form ? form.get(key) : value;

  const options: { value: any; label: any }[] = [];
  Children.forEach(children, (c) => {
    if (isValidElement(c)) {
      options.push({ value: (c.props as any).value, label: (c.props as any).children });
    }
  });

  const commit = (v: any) => {
    if (key && form) form.set(key, v);
    if (onChange) onChange(v);
  };

  return (
    <select
      value={current ?? ''}
      disabled={disabled}
      onChange={(e) => commit(e.target.value)}
      style={{
        width: '100%',
        height: size === 'small' ? 26 : 32,
        padding: '0 8px',
        fontSize: size === 'small' ? 12 : 14,
        fontFamily: 'inherit',
        color: 'var(--text-1)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-3)',
        outline: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o, i) => (
        <option key={i} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

const SelectOption = ({ children }: any) => <>{children}</>;

export const Select: any = SelectRoot;
Select.Option = SelectOption;

// ==================== Switch / Radio ====================

export const Switch = ({ checked, onChange, disabled }: any) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => onChange?.({ target: { checked: !checked } })}
    style={{
      position: 'relative',
      width: 38,
      height: 20,
      flexShrink: 0,
      padding: 0,
      border: 'none',
      borderRadius: 10,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: checked ? 'var(--color-brand-primary)' : 'var(--border)',
      transition: 'background .2s',
      opacity: disabled ? 0.6 : 1,
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: 2,
        left: checked ? 20 : 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        transition: 'left .2s',
      }}
    />
  </button>
);

export const Radio = ({ value, children, style, checked, onChange }: any) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      cursor: 'pointer',
      fontSize: 14,
      color: 'var(--text-2)',
      ...style,
    }}
  >
    <input
      type="radio"
      value={value}
      checked={checked}
      onChange={onChange}
      style={{ marginTop: 3, accentColor: 'var(--color-brand-primary)' }}
    />
    <span>{children}</span>
  </label>
);

Radio.Group = ({ value, onChange, children, layout }: any) => {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <div style={{ display: 'flex', flexDirection: layout === 'vertical' ? 'column' : 'row', gap: 8 }}>
      {items.map((c: any, i: number) =>
        cloneElement(c, {
          key: i,
          checked: value === c.props.value,
          onChange: () => onChange?.(c.props.value),
        }),
      )}
    </div>
  );
};

// ==================== Tabs ====================

const TabsRoot = ({ activeKey, onChange, children, style }: any) => {
  // 注意：这里必须用 Children.forEach 而非 Children.toArray。
  // toArray 会给子元素重新加前缀改写 key（'text' 会变成 '.text'），
  // 导致下面用 TabPane 的 key 去匹配 activeKey 时永远匹配不上，面板内容将始终为空。
  // Children.forEach 回调中拿到的才是携带原始 key 的元素。
  const panes: any[] = [];
  Children.forEach(children, (c) => {
    if (isValidElement(c)) panes.push(c);
  });
  return (
    <div style={style}>
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--divider)' }}>
        {panes.map((c: any) => {
          const k = String(c.key);
          const active = k === activeKey;
          return (
            <div
              key={k}
              onClick={() => onChange?.(k)}
              style={{
                padding: '6px 2px',
                marginBottom: -1,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: active ? 500 : 400,
                whiteSpace: 'nowrap',
                color: active ? 'var(--color-brand-primary)' : 'var(--text-3)',
                borderBottom: active ? '2px solid var(--color-brand-primary)' : '2px solid transparent',
              }}
            >
              {c.props.label}
            </div>
          );
        })}
      </div>
      <div>{panes.filter((c: any) => String(c.key) === activeKey).map((c: any) => c.props.children)}</div>
    </div>
  );
};

export const Tabs: any = TabsRoot;
Tabs.TabPane = ({ children }: any) => <>{children}</>;

// ==================== Collapse ====================

const CollapseRoot = ({ children, style }: any) => {
  const items = Children.toArray(children).filter(isValidElement);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  return (
    <div
      style={{
        border: '1px solid var(--divider)',
        borderRadius: 'var(--radius-3)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {items.map((c: any, i: number) => {
        const code = String(c.props.code ?? i);
        const open = !!openMap[code];
        return (
          <div key={code} style={i > 0 ? { borderTop: '1px solid var(--divider)' } : undefined}>
            <div
              onClick={() => setOpenMap((p) => ({ ...p, [code]: !open }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                cursor: 'pointer',
                background: 'var(--bg-card)',
                fontSize: 14,
                color: 'var(--text-1)',
              }}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <div style={{ flex: 1, minWidth: 0 }}>{c.props.title}</div>
            </div>
            {open && (
              <div style={{ padding: '4px 12px 12px', background: 'var(--bg-card)' }}>{c.props.children}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const Collapse: any = CollapseRoot;
Collapse.Item = ({ children }: any) => <>{children}</>;

// ==================== Tag ====================

const TAG_THEME: Record<string, { fg: string; bg: string; bd: string }> = {
  blue: { fg: '#1a3b7a', bg: 'var(--color-primary-4)', bd: 'var(--color-primary-3)' },
  green: { fg: '#00823f', bg: 'rgba(0,168,84,0.10)', bd: 'rgba(0,168,84,0.35)' },
  orange: { fg: '#d16200', bg: 'rgba(255,119,0,0.10)', bd: 'rgba(255,119,0,0.35)' },
  red: { fg: '#d91a1a', bg: 'rgba(255,31,31,0.08)', bd: 'rgba(255,31,31,0.32)' },
  purple: { fg: '#6b24cc', bg: 'rgba(136,46,255,0.10)', bd: 'rgba(136,46,255,0.32)' },
  teal: { fg: '#00817f', bg: 'var(--color-accent-light)', bd: 'rgba(0,163,163,0.35)' },
  brown: { fg: '#7a5a33', bg: 'rgba(158,117,73,0.10)', bd: 'rgba(158,117,73,0.35)' },
  gray: { fg: 'var(--text-3)', bg: 'var(--bg-card-inner)', bd: 'var(--border)' },
  lightgray: { fg: 'var(--text-3)', bg: 'var(--bg-card-inner)', bd: 'var(--border)' },
};

export const Tag = ({ children, theme = 'lightgray', size, type, closeable, onClose, style, title }: any) => {
  const t = TAG_THEME[theme] || TAG_THEME.lightgray;
  const isMini = size === 'mini';
  const isSmall = size === 'small';
  const bordered = type === 'pure-bordered' || type === 'bordered';
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
        padding: isMini ? '0 6px' : isSmall ? '1px 8px' : '2px 10px',
        height: isMini ? 18 : isSmall ? 22 : 26,
        fontSize: isMini ? 12 : isSmall ? 12 : 13,
        lineHeight: 1,
        color: t.fg,
        background: type === 'bordered' ? 'transparent' : t.bg,
        border: bordered ? `1px solid ${t.bd}` : '1px solid transparent',
        borderRadius: 'var(--radius-4)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      {closeable && (
        <X
          size={12}
          style={{ cursor: 'pointer', flexShrink: 0, opacity: 0.65 }}
          onClick={(e: any) => {
            e.stopPropagation();
            onClose?.();
          }}
        />
      )}
    </span>
  );
};

// ==================== Empty / Card / Row / Col ====================

export const Empty = ({ description }: any) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '8px 0',
      color: 'var(--text-5)',
    }}
  >
    <Inbox size={36} strokeWidth={1.2} />
    <div style={{ fontSize: 13, color: 'var(--text-4)' }}>{description}</div>
  </div>
);

export const Card = ({ children, style, bodyStyle }: any) => (
  <div
    style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-3)',
      boxShadow: 'var(--shadow-card)',
      ...style,
    }}
  >
    <div style={{ padding: 16, ...bodyStyle }}>{children}</div>
  </div>
);

export const Row = ({ gutter = 0, children, style }: any) => {
  const g = typeof gutter === 'number' ? gutter : 0;
  return (
    <div
      className="mtd-prime-row"
      style={{ display: 'flex', flexWrap: 'wrap', marginLeft: -g / 2, marginRight: -g / 2, ...style }}
    >
      {Children.map(children, (c: any) => (isValidElement(c) ? cloneElement(c, { gutter: g }) : c))}
    </div>
  );
};

export const Col = ({ span = 24, gutter = 0, children, style }: any) => (
  <div
    className={`mtd-prime-col-${span}`}
    style={{ width: `${(span / 24) * 100}%`, paddingLeft: gutter / 2, paddingRight: gutter / 2, ...style }}
  >
    {children}
  </div>
);

// ==================== Popconfirm ====================

export const Popconfirm = ({ message: text, onOk, children, placement, okText = '确定', cancelText = '取消' }: any) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const child = Children.only(children) as any;

  const toggleOpen = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) {
      const width = 210;
      const left = placement === 'right' ? r.left : Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 6, left });
    }
    setOpen((v) => !v);
  };

  const handleChildClick = (e: any) => {
    child.props.onClick?.(e);
    toggleOpen();
  };

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {cloneElement(child, { onClick: handleChildClick })}
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'fixed',
              zIndex: 1001,
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: 210,
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-3)',
              boxShadow: 'var(--shadow-mid)',
              padding: 12,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: '20px', marginBottom: 10 }}>{text}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button size="small" onClick={() => setOpen(false)}>
                {cancelText}
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setOpen(false);
                  onOk?.();
                }}
              >
                {okText}
              </Button>
            </div>
          </div>
        </>
      )}
    </span>
  );
};

// ==================== Modal ====================

const ModalRoot = ({ open, title, onClose, children, style, icon }: any) => {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--mask)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-3)',
          boxShadow: 'var(--shadow-high)',
          width: 480,
          maxWidth: '92vw',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          ...style,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--divider)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 500, color: 'var(--text-1)' }}>
            {icon && <Icon type={icon} style={{ fontSize: 16 }} />}
            {title}
          </div>
          <X size={16} style={{ cursor: 'pointer', color: 'var(--text-4)' }} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
};

ModalRoot.Body = ({ children, style }: any) => (
  <div style={{ padding: 20, overflowY: 'auto', flex: 1, minHeight: 0, ...style }}>{children}</div>
);

ModalRoot.Footer = ({ children, style }: any) => (
  <div
    style={{
      padding: '12px 20px',
      borderTop: '1px solid var(--divider)',
      display: 'flex',
      justifyContent: 'flex-end',
      flexShrink: 0,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Modal: any = ModalRoot;
