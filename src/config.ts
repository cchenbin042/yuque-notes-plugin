export const DEFAULT_TOKEN_ENV = 'YUQUE_TOKEN'
export const DEFAULT_GITHUB_TOKEN_ENV = 'GITHUB_TOKEN'

export interface ImageHostingConfig {
  /** 图床类型，当前仅支持 github（仓库 contents API 上传） */
  provider: 'github'
  /** "owner/repo" 形式的目标仓库（建议独立公开仓库存图片） */
  repo: string
  /** 凭据引用名（环境变量名），默认 GITHUB_TOKEN；值每次上传时解析 */
  tokenEnv?: string
  /** 目标分支，默认 main */
  branch?: string
  /** 仓库内图片目录前缀，默认 images */
  basePath?: string
  /** 对外 URL 形式：jsdelivr（默认）或 raw */
  cdn?: 'jsdelivr' | 'raw'
}

export interface YuqueConfig {
  /** 凭据引用名（环境变量名），默认 YUQUE_TOKEN；值每次调用时解析 */
  tokenEnv?: string
  bookName: string
  baseUrl: string
  /** 图片图床配置；未配置时正文图片引用会导致保存失败（fail-loud） */
  imageHosting?: ImageHostingConfig
}

export const DEFAULT_CONFIG: Pick<YuqueConfig, 'bookName' | 'baseUrl'> = {
  bookName: '我的笔记',
  baseUrl: 'https://www.yuque.com',
}

/** resolveConfig 的输出：tokenEnv 与 imageHosting.tokenEnv 均已填默认引用名。 */
export type ResolvedYuqueConfig = Omit<YuqueConfig, 'tokenEnv' | 'imageHosting'> & {
  tokenEnv: string
  imageHosting?: ImageHostingConfig & { tokenEnv: string }
}

export function resolveConfig(partial: Partial<YuqueConfig>): ResolvedYuqueConfig {
  const hosting = partial.imageHosting
  if (hosting !== undefined && hosting.provider !== 'github') {
    throw new Error(`yuque-notes: unsupported image hosting provider "${hosting.provider}"`)
  }
  return {
    tokenEnv: partial.tokenEnv ?? DEFAULT_TOKEN_ENV,
    bookName: partial.bookName?.trim() !== '' && partial.bookName !== undefined
      ? partial.bookName
      : DEFAULT_CONFIG.bookName,
    baseUrl: partial.baseUrl?.trim() !== '' && partial.baseUrl !== undefined
      ? partial.baseUrl
      : DEFAULT_CONFIG.baseUrl,
    ...(hosting === undefined ? {} : {
      imageHosting: {
        ...hosting,
        tokenEnv: hosting.tokenEnv ?? DEFAULT_GITHUB_TOKEN_ENV,
      },
    }),
  }
}
