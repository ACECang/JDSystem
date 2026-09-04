# JDsystem

求职 JD 到个人经历匹配工作台。基于 React + TypeScript + Vite。

## 快速开始

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 产出 dist/
```

## 可用命令

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run preview` - 预览构建结果
- `npm run lint` - 代码检查
- `npm run format` - 格式化代码
- `npm run format:check` - 检查代码格式

## 数据存储

- 所有业务数据（任务、经历库、网站收藏、模型设置）保存在浏览器 `localStorage`。
- 首次启动自动写入示例数据（2 段实习 + 2 个项目 + 7 项技能、5 个常用网站）。
- 数据仅存于当前浏览器，清除浏览器存储会丢失。

## 大模型架构

系统采用「**多模态输入归一化 → 单一文本模型出口**」的四模块结构：

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| ① Config | `types.ts` / `settings` UI | 管 API Key、Base URL、文本模型名、视觉模型名、可编辑的 prompt 模板 |
| ② InputRouter | `lib/llm/inputRouter.ts` | 判断输入是否含图片：无图直接透传，有图先转文字再合并 |
| ③ VisionExtractor | `lib/llm/visionExtractor.ts` | 调视觉模型，**只把图片转成文字，不做任何生成**；固定 prompt + 低温 + 关闭思考模式 |
| ④ TextGenerator | `lib/llm/provider.ts` | **唯一的生成出口**：JD 解析、经历匹配、内容生成三个节点全部走它，靠不同 prompt 模板区分 |

关键约定：

- **职责分离**：视觉模型只负责"看懂"，所有生成决策一律由文本模型完成，最终输出只受一个模型、一套协议约束。
- **无图不调视觉模型**：纯文字输入直接进 TextGenerator，不产生任何视觉调用。
- **失败降级**：`useLlm` 关闭或调用失败时，自动降级为内置规则引擎，核心功能始终可用。
- **图片不落库**：截图只存在于组件本地状态，转成文字后即丢弃，避免 base64 撑爆 localStorage。

## 大模型配置（可选）

- 关闭大模型时，JD 解析、经历匹配、内容生成全部走内置的**规则引擎**，核心功能完整可用。
- 开启方式：右上角「模型设置」→ 填写 Base URL、API Key、**文本模型名**、**视觉模型名** → 保存。
  - 接口需为 OpenAI 兼容的 `/chat/completions` 格式，系统会自动拼接端点。
  - 浏览器直连接口，因此服务端需允许跨域（CORS）。
  - 视觉模型仅在上传图片时才调用，纯文字场景不会用到。
- 「模型设置」底部可展开 **Prompt 模板**（高级）：五个模板均可直接编辑并单独/全部恢复默认。
  其中「方法论核心规则」是公共前缀，会以 `{{coreRules}}` 注入到三个生成模板，改它会同时影响全部生成节点。

## 已知限制

- 不再支持职位链接抓取：原实现依赖内网代理，且浏览器直连受 CORS 与招聘站反爬限制基本不可用，已移除。请使用文本粘贴或截图上传。
- API Key 存于浏览器 localStorage 且前端直连模型服务，会暴露在前端，仅建议自用场景。

## 技术栈

- React 18.3.1
- TypeScript 5.9.3
- Vite 5.4.11
- 自研 UI 组件层（`src/vendor/mtd-react3`）
- localStorage 数据层（`src/lib/db.ts`）
- Prettier 3.6.2
- ESLint 9.39.1

## 项目结构

```
src/
├── components/workbench/  # 工作台各功能面板
├── lib/
│   ├── db.ts              # 数据访问层（localStorage）
│   ├── jdParser.ts        # 图片识别 / 链接抓取
│   ├── llm/
│   │   ├── provider.ts    # 大模型调度 + 规则引擎降级
│   │   ├── promptSchemas.ts
│   │   └── ruleEngine.ts
│   └── seedData.ts
├── styles/tokens.css      # 设计 Token
├── vendor/mtd-react3/     # UI 组件层
├── types.ts               # 全局类型
├── App.tsx
└── main.tsx
```
