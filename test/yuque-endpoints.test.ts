import { afterEach, describe, expect, it, vi } from 'vitest'
import { YuqueClient } from '../src/yuque.ts'

const client = new YuqueClient({ token: 'tk_test', baseUrl: 'https://www.yuque.com' })
afterEach(() => vi.unstubAllGlobals())

function stubFetch(data: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data }) })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('YuqueClient endpoints', () => {
  it('listRepos calls the user repos endpoint', async () => {
    const fn = stubFetch([{ id: 1, name: 'n', slug: 's', namespace: 'alice/s' }])
    await client.listRepos('alice')
    expect(fn.mock.calls[0]![0]).toBe('https://www.yuque.com/api/v2/users/alice/repos')
  })

  it('createRepo posts name and description', async () => {
    const fn = stubFetch({ id: 2, name: '我的笔记', slug: 'my-notes', namespace: 'alice/my-notes' })
    await client.createRepo('alice', { name: '我的笔记', description: 'personal notes' })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ name: '我的笔记', description: 'personal notes', public: 0 })
  })

  it('getToc returns raw nodes', async () => {
    const fn = stubFetch([{ uuid: 'u1', title: 't', slug: 's', parent_uuid: null, type: 'TITLE' }])
    await client.getToc(42)
    expect(fn.mock.calls[0]![0]).toBe('https://www.yuque.com/api/v2/repos/42/toc')
  })

  it('createTocNode sends the flat TITLE appendNode payload', async () => {
    const fn = stubFetch([{ uuid: 'new-uuid', title: '前端', slug: 'fe', parent_uuid: 'p1', type: 'TITLE' }])
    const result = await client.createTocNode(42, { title: '前端', parentUuid: 'p1' })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'appendNode', action_mode: 'child', title: '前端', type: 'TITLE', target_uuid: 'p1',
    })
    expect(init.method).toBe('PUT')
    expect(fn.mock.calls[0]![0]).toBe('https://www.yuque.com/api/v2/repos/42/toc')
    expect(result).toEqual({ uuid: 'new-uuid', title: '前端' })
  })

  it('createTocNode at root level omits target_uuid and matches null parent', async () => {
    const fn = stubFetch([{ uuid: 'r2', title: '后端', slug: 'be', parent_uuid: null, type: 'TITLE' }])
    const result = await client.createTocNode(42, { title: '后端' })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'appendNode', action_mode: 'child', title: '后端', type: 'TITLE',
    })
    expect(result).toEqual({ uuid: 'r2', title: '后端' })
  })

  it('appendDocToToc mounts a doc with doc_id at root or under a parent', async () => {
    const fn = stubFetch([{ uuid: 'd1', title: 'T', slug: 's', parent_uuid: null, type: 'DOC' }])
    await client.appendDocToToc(42, { title: 'T', docId: 9 })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      action: 'appendNode', action_mode: 'child', title: 'T', type: 'DOC', doc_id: 9,
    })
    expect(init.method).toBe('PUT')

    fn.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ data: [{ uuid: 'd2', title: 'T2', slug: 's2', parent_uuid: 'p1', type: 'DOC' }] }),
    })
    const result = await client.appendDocToToc(42, { title: 'T2', docId: 10, parentUuid: 'p1' })
    const [, init2] = fn.mock.calls[1] as unknown as [string, RequestInit]
    expect(JSON.parse(init2.body as string)).toEqual({
      action: 'appendNode', action_mode: 'child', title: 'T2', type: 'DOC', doc_id: 10, target_uuid: 'p1',
    })
    expect(result).toEqual({ uuid: 'd2', title: 'T2', slug: 's2', parent_uuid: 'p1', type: 'DOC' })
  })

  it('createDoc posts markdown body and composes url from namespace', async () => {
    const fn = stubFetch({ id: 9, slug: 'doc-1', title: 'T' })
    const result = await client.createDoc(42, {
      title: 'T', body: '# hi', slug: undefined, namespace: 'alice/my-notes',
    })
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ title: 'T', body: '# hi', format: 'markdown', slug: undefined })
    expect(fn.mock.calls[0]![0]).toBe('https://www.yuque.com/api/v2/repos/42/docs')
    expect(result.url).toBe('https://www.yuque.com/alice/my-notes/doc-1')
  })

  it('deleteDoc deletes a doc by slug', async () => {
    const fn = stubFetch({})
    await client.deleteDoc(42, 'doc-1')
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(fn.mock.calls[0]![0]).toBe('https://www.yuque.com/api/v2/repos/42/docs/doc-1')
    expect(init.method).toBe('DELETE')
  })

  it('fails loudly without touching the network when token is empty', async () => {
    const fn = stubFetch({})
    const noToken = new YuqueClient({ token: '', baseUrl: 'https://www.yuque.com' })
    await expect(noToken.getUser()).rejects.toThrow(/YUQUE_TOKEN not configured/)
    expect(fn).not.toHaveBeenCalled()
  })

})
