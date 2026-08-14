import { describe, expect, it, vi } from 'vitest'
import { createNote } from '../src/doc.ts'
import type { YuqueClient } from '../src/yuque.ts'

describe('createNote', () => {
  it('creates a doc without images and mounts it at root', async () => {
    const client = {
      createDoc: vi.fn().mockResolvedValue({ id: 1, slug: 's', title: 'T', url: 'u' }),
      appendDocToToc: vi.fn().mockResolvedValue({ uuid: 'n1', title: 'T', slug: 's', parent_uuid: null, type: 'DOC' }),
    } as unknown as YuqueClient
    const result = await createNote(client, 42, { title: 'T', body: '# hi', namespace: 'alice/my-notes' }, {})
    expect(result).toEqual({ id: 1, slug: 's', title: 'T', url: 'u', uploadedImages: 0 })
    expect(client.createDoc).toHaveBeenCalledWith(
      42, { title: 'T', body: '# hi', slug: undefined, namespace: 'alice/my-notes' }, undefined,
    )
    expect(client.appendDocToToc).toHaveBeenCalledWith(42, { title: 'T', docId: 1 }, undefined)
  })

  it('mounts under dirUuid when provided', async () => {
    const client = {
      createDoc: vi.fn().mockResolvedValue({ id: 1, slug: 's', title: 'T', url: 'u' }),
      appendDocToToc: vi.fn().mockResolvedValue({ uuid: 'n1', title: 'T', slug: 's', parent_uuid: 'dir1', type: 'DOC' }),
    } as unknown as YuqueClient
    await createNote(client, 42, { title: 'T', body: '# hi', namespace: 'alice/my-notes', dirUuid: 'dir1' }, {})
    expect(client.appendDocToToc).toHaveBeenCalledWith(42, { title: 'T', docId: 1, parentUuid: 'dir1' }, undefined)
  })

  it('mounts at root when dirUuid is an empty string', async () => {
    const client = {
      createDoc: vi.fn().mockResolvedValue({ id: 1, slug: 's', title: 'T', url: 'u' }),
      appendDocToToc: vi.fn().mockResolvedValue({ uuid: 'n1', title: 'T', slug: 's', parent_uuid: null, type: 'DOC' }),
    } as unknown as YuqueClient
    await createNote(client, 42, { title: 'T', body: '# hi', namespace: 'alice/my-notes', dirUuid: '' }, {})
    expect(client.appendDocToToc).toHaveBeenCalledWith(42, { title: 'T', docId: 1 }, undefined)
  })

  it('rolls back the doc when toc mounting fails', async () => {
    const client = {
      createDoc: vi.fn().mockResolvedValue({ id: 1, slug: 's', title: 'T', url: 'u' }),
      appendDocToToc: vi.fn().mockRejectedValue(new Error('mount failed')),
      deleteDoc: vi.fn().mockResolvedValue({}),
    } as unknown as YuqueClient
    await expect(
      createNote(client, 42, { title: 'T', body: '# hi', namespace: 'alice/my-notes' }, {}),
    ).rejects.toThrow(/attach|mount|toc/i)
    expect(client.deleteDoc).toHaveBeenCalledWith(42, 's', undefined)
  })

  it('reports the orphan doc url when rollback also fails', async () => {
    const client = {
      createDoc: vi.fn().mockResolvedValue({ id: 1, slug: 's', title: 'T', url: 'u' }),
      appendDocToToc: vi.fn().mockRejectedValue(new Error('mount failed')),
      deleteDoc: vi.fn().mockRejectedValue(new Error('delete failed')),
    } as unknown as YuqueClient
    const error = await createNote(client, 42, { title: 'T', body: '# hi', namespace: 'alice/my-notes' }, {})
      .then(() => null, (e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/attach to toc \(u\)/)
    expect((error as Error).message).toMatch(/rollback also failed/)
    expect((error as Error).cause).toBeInstanceOf(Error)
  })

  it('uploads attachment images before creating the doc', async () => {
    const client = {
      createDoc: vi.fn().mockResolvedValue({ id: 1, slug: 's', title: 'T', url: 'u' }),
      appendDocToToc: vi.fn().mockResolvedValue({ uuid: 'n1', title: 'T', slug: 's', parent_uuid: null, type: 'DOC' }),
      uploadImage: vi.fn().mockResolvedValue({ url: 'https://cdn.yuque.com/abc.png' }),
    } as unknown as YuqueClient
    const attachments = {
      readImage: vi.fn().mockResolvedValue({
        ref: { attachmentId: 'abc', mediaType: 'image/png' },
        data: new Uint8Array([1, 2]),
      }),
    }
    const result = await createNote(
      client,
      42,
      { title: 'T', body: '![a](attachment://abc)', namespace: 'alice/my-notes' },
      { attachments },
    )
    expect(result.uploadedImages).toBe(1)
    const body = (client.createDoc as ReturnType<typeof vi.fn>).mock.calls[0]![1].body as string
    expect(body).toMatch(/^!\[a\]\(https:\/\/cdn/)
  })

  it('fails loud on empty image references without creating the doc', async () => {
    const client = {
      createDoc: vi.fn(),
      appendDocToToc: vi.fn(),
    } as unknown as YuqueClient
    await expect(
      createNote(client, 42, { title: 'T', body: '![](  )', namespace: 'alice/my-notes' }, {}),
    ).rejects.toThrow(/image|invalid/i)
    expect(client.createDoc).not.toHaveBeenCalled()
  })

  it('throws when any image upload fails', async () => {
    const client = {
      createDoc: vi.fn(),
      appendDocToToc: vi.fn(),
    } as unknown as YuqueClient
    await expect(createNote(client, 42, { title: 'T', body: '![a](attachment://missing)', namespace: 'alice/my-notes' }, {
      attachments: { readImage: vi.fn().mockRejectedValue(new Error('gone')) },
    })).rejects.toThrow(/missing|upload|image/i)
    expect(client.createDoc).not.toHaveBeenCalled()
    expect(client.appendDocToToc).not.toHaveBeenCalled()
  })
})
