import { randomBytes } from 'node:crypto'
import type { RepoInfo, YuqueClient } from './yuque.ts'

/** 中文等非 ASCII 名生成稳定的 ASCII slug；空结果用随机后缀兜底。 */
export function makeSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug === '' ? `book-${randomBytes(4).toString('hex')}` : slug
}

/** 按 name 精确匹配复用知识库；缺失时创建（422 缺 slug 则带 ASCII slug 重试一次）。 */
export async function ensureBook(
  client: YuqueClient,
  login: string,
  bookName: string,
  signal?: AbortSignal,
): Promise<RepoInfo> {
  const repos = await client.listRepos(login, signal)
  const existing = repos.find(r => r.name === bookName)
  if (existing !== undefined) return existing
  try {
    return await client.createRepo(login, { name: bookName }, signal)
  } catch (error) {
    if (!(error instanceof Error) || !('status' in error) || (error as { status: number }).status !== 422) {
      throw error
    }
    return client.createRepo(login, { name: bookName, slug: makeSlug(bookName) }, signal)
  }
}
