import { randomBytes } from 'node:crypto'
import type { ImageSource } from './images.ts'

export interface GitHubHostingOptions {
  /** "owner/repo" 形式的目标仓库 */
  repo: string
  /** GitHub token（contents API 写入用，建议 env 注入） */
  token: string
  /** 目标分支，默认 main */
  branch?: string
  /** 仓库内图片目录前缀，默认 images */
  basePath?: string
  /** 对外 URL 形式：jsdelivr CDN（默认）或 raw.githubusercontent */
  cdn?: 'jsdelivr' | 'raw'
}

const EXT_BY_MEDIA: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/** 构建 GitHub 仓库图床上传器：PUT contents API 后返回公网图片 URL。 */
export function createGithubUploader(
  options: GitHubHostingOptions,
): (image: ImageSource, signal?: AbortSignal) => Promise<string> {
  const branch = options.branch ?? 'main'
  const basePath = (options.basePath ?? 'images').replace(/^\/+|\/+$/g, '')
  const [owner, repo] = options.repo.split('/')
  if (owner === undefined || repo === undefined) {
    throw new Error(`yuque-notes: invalid github repo "${options.repo}", expected "owner/repo"`)
  }
  const cdnUrl = (path: string): string => options.cdn === 'raw'
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`

  return async (image, signal) => {
    const ext = EXT_BY_MEDIA[image.mediaType] ?? 'bin'
    const name = `${randomBytes(8).toString('hex')}.${ext}`
    const path = `${basePath}/${name}`
    const body = JSON.stringify({
      message: `chore: upload image ${name} by yuque-notes-plugin`,
      content: Buffer.from(image.data).toString('base64'),
    })
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'User-Agent': 'yuque-notes-plugin',
        'Content-Type': 'application/json',
      },
      body,
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { message?: unknown }
      throw new Error(
        `yuque-notes: github upload failed (${response.status}): ${typeof detail.message === 'string' ? detail.message : 'request failed'}`,
      )
    }
    return cdnUrl(path)
  }
}
