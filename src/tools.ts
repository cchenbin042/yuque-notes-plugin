import type { Context } from '@deepseek-ai/cordis'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import { ensureBook } from './book.ts'
import { createNote } from './doc.ts'
import { buildTocTree, renderTocTree, type TocNode } from './toc.ts'
import type { ImageSource } from './images.ts'
import type { RepoInfo, YuqueClient } from './yuque.ts'

export interface ToolDeps {
  client: YuqueClient
  bookName: string
  attachments?: Pick<AttachmentStore, 'readImage'>
  upload?: (image: ImageSource, signal?: AbortSignal) => Promise<string>
}

export function registerTools(ctx: Context, deps: ToolDeps): void {
  ctx.tools.register(defineTool({
    name: 'yuque_list_toc',
    description: '列出语雀笔记知识库的目录树，用于决定新笔记的分类位置。前置条件：已配置 YUQUE_TOKEN 环境变量；未配置时不要调用本工具，直接告知用户设置 YUQUE_TOKEN。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          book: {
            type: 'object',
            required: true,
            additionalProperties: true,
            properties: {
              name: { type: 'string', required: true },
              slug: { type: 'string', required: true },
            },
          },
          tree: { type: 'array', required: true, items: { type: 'object', additionalProperties: true } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderTocTree((value as unknown as { tree: TocNode[] }).tree) }],
    },
    async execute(_args, exec) {
      const { repo } = await resolveBook(deps, exec.signal)
      const raw = await deps.client.getToc(repo.id, exec.signal)
      const tree = buildTocTree(raw) as unknown as Record<string, JsonValue>[]
      return { book: { name: repo.name, slug: repo.slug }, tree }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'yuque_create_dir',
    description: '在语雀笔记知识库中创建目录（分类）节点；同名同父已存在时直接返回既有节点。前置条件：已配置 YUQUE_TOKEN 环境变量；未配置时不要调用本工具，直接告知用户设置 YUQUE_TOKEN。',
    parameters: {
      title: { type: 'string', required: true, description: '目录标题，如「技术/前端」的子目录标题' },
      parentUuid: { type: 'string', description: '父目录节点 uuid；省略则创建在根层' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          uuid: { type: 'string', required: true },
          title: { type: 'string', required: true },
          parentUuid: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
        },
      },
      render: (args, value) => [{ type: 'text', text: `目录「${args.title}」已就绪 (${(value as { uuid: string }).uuid})` }],
    },
    async execute(args, exec) {
      const { repo } = await resolveBook(deps, exec.signal)
      const raw = await deps.client.getToc(repo.id, exec.signal)
      const existing = findNode(buildTocTree(raw), args.title, args.parentUuid ?? null)
      if (existing !== undefined) {
        return { uuid: existing.uuid, title: existing.title, parentUuid: existing.parentUuid }
      }
      const created = await deps.client.createTocNode(repo.id, {
        title: args.title,
        ...(args.parentUuid === undefined ? {} : { parentUuid: args.parentUuid }),
      }, exec.signal)
      return { uuid: created.uuid, title: created.title, parentUuid: args.parentUuid ?? null }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'yuque_create_doc',
    description: '把一条笔记保存为语雀文档。正文为 Markdown；图片用 ![](attachment://<id>) 或本地路径内联引用，插件自动上传替换。前置条件：已配置 YUQUE_TOKEN 环境变量；未配置时不要调用本工具，直接告知用户设置 YUQUE_TOKEN。',
    parameters: {
      title: { type: 'string', required: true, description: '文档标题，从笔记内容提炼，简洁具体' },
      body: { type: 'string', required: true, description: 'Markdown 正文' },
      dirUuid: { type: 'string', description: '目标目录节点 uuid（先用 yuque_list_toc 查询）' },
      slug: { type: 'string', description: '可选文档 slug（URL 标识）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'number', required: true },
          slug: { type: 'string', required: true },
          title: { type: 'string', required: true },
          url: { type: 'string', required: true },
          dirUuid: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          uploadedImages: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `已保存：《${(value as { title: string }).title}》 ${(value as { url: string }).url}` }],
    },
    async execute(args, exec) {
      const { repo } = await resolveBook(deps, exec.signal)
      // 真实 Session 的 cwd 在 header（meta 只是创建选项，非运行时属性）
      const cwd = exec.agent === undefined
        ? undefined
        : (exec.agent.session as unknown as { header: { cwd?: string } }).header.cwd
      const result = await createNote(deps.client, repo.id, {
        title: args.title,
        body: args.body,
        namespace: repo.namespace,
        ...(args.dirUuid === undefined ? {} : { dirUuid: args.dirUuid }),
        ...(args.slug === undefined ? {} : { slug: args.slug }),
      }, {
        ...(deps.attachments === undefined ? {} : { attachments: deps.attachments }),
        ...(deps.upload === undefined ? {} : { upload: deps.upload }),
        ...(cwd === undefined ? {} : { cwd }),
        signal: exec.signal,
      })
      return { ...result, dirUuid: args.dirUuid ?? null }
    },
  }))
}

/** 定位（必要时自动创建）知识库，返回含 id/name/slug 的 RepoInfo。 */
async function resolveBook(
  deps: ToolDeps,
  signal?: AbortSignal,
): Promise<{ repo: RepoInfo }> {
  const user = await deps.client.getUser(signal)
  const repo = await ensureBook(deps.client, user.login, deps.bookName, signal)
  return { repo }
}

function findNode(tree: readonly TocNode[], title: string, parentUuid: string | null): TocNode | undefined {
  for (const node of tree) {
    if (node.type === 'title' && node.title === title && node.parentUuid === parentUuid) return node
    const found = findNode(node.children, title, parentUuid)
    if (found !== undefined) return found
  }
  return undefined
}
