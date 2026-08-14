import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { resolveConfig } from './config.ts'
import { registerTools } from './tools.ts'
import { YuqueClient } from './yuque.ts'

export const name = 'yuque-notes-plugin'

/** Services required by this plugin (cordis activation gate). */
export const inject = ['tools']

export function apply(ctx: Context, config: Partial<import('./config.ts').YuqueConfig> = {}): void {
  const resolved = resolveConfig(config)
  const client = new YuqueClient({ token: resolved.token, baseUrl: resolved.baseUrl })
  const attachments = ctx.get('attachments') as Pick<AttachmentStore, 'readImage'> | undefined
  registerTools(ctx, { client, bookName: resolved.bookName, ...(attachments === undefined ? {} : { attachments }) })
}
