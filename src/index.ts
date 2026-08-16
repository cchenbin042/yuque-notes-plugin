import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { resolveCredential } from './credentials.ts'
import { resolveConfig } from './config.ts'
import { createGithubUploader } from './hosting.ts'
import { registerTools } from './tools.ts'
import { YuqueClient } from './yuque.ts'

export const name = 'yuque-notes-plugin'

/** Services required by this plugin (cordis activation gate). */
export const inject = ['tools']

export function apply(ctx: Context, config: Partial<import('./config.ts').YuqueConfig> = {}): void {
  const resolved = resolveConfig(config)
  // token 不再在加载时固化：每次工具调用/上传时经凭据 seam 惰性解析
  const client = new YuqueClient({
    token: () => resolveCredential(ctx, resolved.tokenEnv, '语雀 token'),
    baseUrl: resolved.baseUrl,
  })
  const attachments = ctx.get('attachments') as Pick<AttachmentStore, 'readImage'> | undefined
  const hosting = resolved.imageHosting
  const upload = hosting === undefined ? undefined : createGithubUploader({
    repo: hosting.repo,
    token: () => resolveCredential(ctx, hosting.tokenEnv, 'GitHub 图床 token'),
    ...(hosting.branch === undefined ? {} : { branch: hosting.branch }),
    ...(hosting.basePath === undefined ? {} : { basePath: hosting.basePath }),
    ...(hosting.cdn === undefined ? {} : { cdn: hosting.cdn }),
  })
  registerTools(ctx, {
    client,
    bookName: resolved.bookName,
    ...(attachments === undefined ? {} : { attachments }),
    ...(upload === undefined ? {} : { upload }),
  })
}
