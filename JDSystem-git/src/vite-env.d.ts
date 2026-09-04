/// <reference types="vite/client" />

/**
 * 预置模型配置所用的环境变量。
 *
 * 在项目根目录建一个 .env.local 填入即可（该文件已被 .gitignore 的 `*.local`
 * 规则忽略，不会进版本库）。改完需要重启 dev server 才会生效。
 *
 * 复制 .env.example 为 .env.local 后填写。
 */
interface ImportMetaEnv {
  /** 接口地址，默认 https://open.bigmodel.cn/api/paas/v4 */
  readonly VITE_DEFAULT_API_URL?: string;
  /** API Key。填了才会默认启用大模型，留空则走规则引擎 */
  readonly VITE_DEFAULT_API_KEY?: string;
  /** 文本模型（生成唯一出口），默认 glm-4.7-flash */
  readonly VITE_DEFAULT_TEXT_MODEL?: string;
  /** 视觉模型（仅用于图片提取），默认 glm-4.6v-flash */
  readonly VITE_DEFAULT_VISION_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
