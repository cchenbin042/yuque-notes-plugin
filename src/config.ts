export interface ImageHostingConfig {
  /** 图床类型，当前仅支持 github（仓库 contents API 上传） */
  provider: 'github'
  /** "owner/repo" 形式的目标仓库（建议独立公开仓库存图片） */
  repo: string
  /** GitHub token（contents API 写入；建议 env 注入，如 !!js process.env.GITHUB_TOKEN） */
  token: string
  /** 目标分支，默认 main */
  branch?: string
  /** 仓库内图片目录前缀，默认 images */
  basePath?: string
  /** 对外 URL 形式：jsdelivr（默认）或 raw */
  cdn?: 'jsdelivr' | 'raw'
}

export interface YuqueConfig {
  token: string
  bookName: string
  baseUrl: string
  /** 图片图床配置；未配置时正文图片引用会导致保存失败（fail-loud） */
  imageHosting?: ImageHostingConfig
}

export const DEFAULT_CONFIG: Pick<YuqueConfig, 'bookName' | 'baseUrl'> = {
  bookName: '我的笔记',
  baseUrl: 'https://www.yuque.com',
}

export function resolveConfig(partial: Partial<YuqueConfig>): YuqueConfig {
  const hosting = partial.imageHosting
  if (hosting !== undefined && hosting.provider !== 'github') {
    throw new Error(`yuque-notes: unsupported image hosting provider "${hosting.provider}"`)
  }
  return {
    token: partial.token?.trim() ?? '',
    bookName: partial.bookName?.trim() !== '' && partial.bookName !== undefined
      ? partial.bookName
      : DEFAULT_CONFIG.bookName,
    baseUrl: partial.baseUrl?.trim() !== '' && partial.baseUrl !== undefined
      ? partial.baseUrl
      : DEFAULT_CONFIG.baseUrl,
    ...(hosting === undefined ? {} : { imageHosting: hosting }),
  }
}
