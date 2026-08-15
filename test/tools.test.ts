import { describe, expect, it, vi } from 'vitest'
import { registerTools } from '../src/tools.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { YuqueClient } from '../src/yuque.ts'

const rawToc = [
  { uuid: 'r1', title: '技术', slug: 'tech', parent_uuid: null, type: 'TITLE' },
  { uuid: 'd1', title: 'git 笔记', slug: 'git', parent_uuid: 'r1', type: 'DOC' },
]

function makeContext(): { ctx: Context; registered: Record<string, unknown>[] } {
  const registered: Record<string, unknown>[] = []
  const ctx = {
    tools: { register: (tool: Record<string, unknown>) => { registered.push(tool) } },
    get: () => undefined,
  } as unknown as Context
  return { ctx, registered }
}

describe('registerTools', () => {
  it('registers exactly three tools', () => {
    const { ctx, registered } = makeContext()
    const client = { getToc: vi.fn(), createTocNode: vi.fn() } as unknown as YuqueClient
    registerTools(ctx, { client, bookName: '我的笔记' })
    expect(registered.map(t => t.name).sort()).toEqual(['yuque_create_dir', 'yuque_create_doc', 'yuque_list_toc'])
  })

  it('list_toc renders the tree text', async () => {
    const { ctx, registered } = makeContext()
    const client = {
      getUser: vi.fn().mockResolvedValue({ login: 'alice', name: 'alice' }),
      listRepos: vi.fn().mockResolvedValue([{ id: 7, name: '我的笔记', slug: 'n', namespace: 'alice/n' }]),
      getToc: vi.fn().mockResolvedValue(rawToc),
    } as unknown as YuqueClient
    registerTools(ctx, { client, bookName: '我的笔记' })
    const tool = registered.find(t => t.name === 'yuque_list_toc') as Record<string, () => Promise<unknown>>
    const execute = tool.execute as (args: Record<string, never>, exec: Record<string, unknown>) => Promise<unknown>
    const result = await execute({}, { signal: new AbortController().signal, agent: { session: { header: { cwd: '/home/alice' } } } })
    expect(result).toEqual({
      book: { name: '我的笔记', slug: 'n' },
      tree: [
        { uuid: 'r1', title: '技术', type: 'title', parentUuid: null, children: [
          { uuid: 'd1', title: 'git 笔记', type: 'doc', parentUuid: 'r1', children: [] },
        ] },
      ],
    })
  })

  it('create_dir is idempotent for same title under same parent', async () => {
    const { ctx, registered } = makeContext()
    const client = {
      getUser: vi.fn().mockResolvedValue({ login: 'alice', name: 'alice' }),
      listRepos: vi.fn().mockResolvedValue([{ id: 7, name: '我的笔记', slug: 'n', namespace: 'alice/n' }]),
      getToc: vi.fn().mockResolvedValue([{ uuid: 'x', title: '前端', slug: 'fe', parent_uuid: null, type: 'TITLE' }]),
      createTocNode: vi.fn(),
    } as unknown as YuqueClient
    registerTools(ctx, { client, bookName: '我的笔记' })
    const tool = registered.find(t => t.name === 'yuque_create_dir') as Record<string, () => Promise<unknown>>
    const execute = tool.execute as (args: Record<string, string>, exec: Record<string, unknown>) => Promise<unknown>
    const result = await execute({ title: '前端' }, { signal: new AbortController().signal, agent: { session: { header: { cwd: '/x' } } } })
    expect(result).toEqual({ uuid: 'x', title: '前端', parentUuid: null })
    expect(client.createTocNode).not.toHaveBeenCalled()
  })

  it('create_doc creates the doc and mounts it to the toc', async () => {
    const { ctx, registered } = makeContext()
    const client = {
      getUser: vi.fn().mockResolvedValue({ login: 'alice', name: 'alice' }),
      listRepos: vi.fn().mockResolvedValue([{ id: 7, name: '我的笔记', slug: 'n', namespace: 'alice/n' }]),
      createDoc: vi.fn().mockResolvedValue({ id: 9, slug: 's', title: 'T', url: 'u' }),
      appendDocToToc: vi.fn().mockResolvedValue({ uuid: 'd1', title: 'T', slug: 's', parent_uuid: null, type: 'DOC' }),
    } as unknown as YuqueClient
    registerTools(ctx, { client, bookName: '我的笔记' })
    const tool = registered.find(t => t.name === 'yuque_create_doc') as Record<string, () => Promise<unknown>>
    const execute = tool.execute as (args: Record<string, string>, exec: Record<string, unknown>) => Promise<unknown>
    const result = await execute(
      { title: 'T', body: 'hello' },
      { signal: new AbortController().signal, agent: { session: { header: { cwd: '/home/alice' } } } },
    )
    expect(result).toEqual({ id: 9, slug: 's', title: 'T', url: 'u', dirUuid: null, uploadedImages: 0 })
    expect(client.createDoc).toHaveBeenCalledWith(
      7, expect.objectContaining({ title: 'T', namespace: 'alice/n' }), expect.anything(),
    )
    expect(client.appendDocToToc).toHaveBeenCalled()
  })

  it('create_doc passes cwd for relative image paths', async () => {
    const { ctx, registered } = makeContext()
    const client = {
      getUser: vi.fn().mockResolvedValue({ login: 'alice', name: 'alice' }),
      listRepos: vi.fn().mockResolvedValue([{ id: 7, name: '我的笔记', slug: 'n', namespace: 'alice/n' }]),
      createDoc: vi.fn().mockResolvedValue({ id: 9, slug: 's', title: 'T', url: 'u' }),
    } as unknown as YuqueClient
    registerTools(ctx, { client, bookName: '我的笔记' })
    const tool = registered.find(t => t.name === 'yuque_create_doc') as Record<string, () => Promise<unknown>>
    const execute = tool.execute as (args: Record<string, string>, exec: Record<string, unknown>) => Promise<unknown>
    // attachment 服务未挂载 → 图片上传失败，整次调用报错而非静默成功
    await expect(
      execute(
        { title: 'T', body: '![a](attachment://img1)' },
        { signal: new AbortController().signal, agent: { session: { header: { cwd: '/home/alice' } } } },
      ),
    ).rejects.toThrow(/image upload failed/)
  })
})
