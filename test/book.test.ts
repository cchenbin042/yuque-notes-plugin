import { describe, expect, it, vi } from 'vitest'
import { ensureBook, makeSlug } from '../src/book.ts'
import type { RepoInfo, YuqueClient } from '../src/yuque.ts'

const repo: RepoInfo = { id: 1, name: '我的笔记', slug: 'my-notes', namespace: 'alice/my-notes' }

describe('makeSlug', () => {
  it('lowercases and dashes', () => {
    expect(makeSlug('My Notes!')).toBe('my-notes')
  })
  it('falls back for non-ascii names', () => {
    expect(makeSlug('我的笔记')).toMatch(/^book-[0-9a-f]{8}$/)
  })
  it('returns stable slug for same input', () => {
    expect(makeSlug('Notes')).toBe('notes')
  })
})

describe('ensureBook', () => {
  it('reuses an existing book by exact name', async () => {
    const client = {
      listRepos: vi.fn().mockResolvedValue([repo]),
      createRepo: vi.fn(),
    } as unknown as YuqueClient
    const result = await ensureBook(client, 'alice', '我的笔记')
    expect(result).toEqual(repo)
    expect(client.createRepo).not.toHaveBeenCalled()
  })

  it('creates a missing book', async () => {
    const client = {
      listRepos: vi.fn().mockResolvedValue([]),
      createRepo: vi.fn().mockResolvedValue(repo),
    } as unknown as YuqueClient
    const result = await ensureBook(client, 'alice', '我的笔记')
    expect(result).toEqual(repo)
    expect(client.createRepo).toHaveBeenCalledWith('alice', { name: '我的笔记' }, undefined)
  })

  it('retries with ascii slug when creation fails with 422', async () => {
    const error = new Error('need slug') as Error & { code: string; status: number }
    error.code = 'yuque-api'
    error.status = 422
    const client = {
      listRepos: vi.fn().mockResolvedValue([]),
      createRepo: vi.fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(repo),
    } as unknown as YuqueClient
    const result = await ensureBook(client, 'alice', '我的笔记')
    expect(result).toEqual(repo)
    expect(client.createRepo).toHaveBeenCalledTimes(2)
    const [, secondCall] = (client.createRepo as ReturnType<typeof vi.fn>).mock.calls[1] as unknown[]
    expect((secondCall as { slug: string }).slug).toMatch(/^book-[0-9a-f]{8}$/)
  })
})
