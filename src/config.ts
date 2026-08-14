export interface YuqueConfig {
  token: string
  bookName: string
  baseUrl: string
}

export const DEFAULT_CONFIG: Pick<YuqueConfig, 'bookName' | 'baseUrl'> = {
  bookName: '我的笔记',
  baseUrl: 'https://www.yuque.com',
}

export function resolveConfig(partial: Partial<YuqueConfig>): YuqueConfig {
  const token = partial.token?.trim() ?? ''
  if (token === '') {
    throw new Error('yuque-notes: missing required config "token" (set YUQUE_TOKEN or cordis.yml config token)')
  }
  return {
    token,
    bookName: partial.bookName?.trim() !== '' && partial.bookName !== undefined
      ? partial.bookName
      : DEFAULT_CONFIG.bookName,
    baseUrl: partial.baseUrl?.trim() !== '' && partial.baseUrl !== undefined
      ? partial.baseUrl
      : DEFAULT_CONFIG.baseUrl,
  }
}
