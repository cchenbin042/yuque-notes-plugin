import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/index.ts'

describe('plugin entry', () => {
  it('declares the tools service dependency for cordis activation', () => {
    expect(inject).toEqual(['tools'])
  })

  it('registers tools when config is valid', () => {
    const register = vi.fn()
    const ctx = {
      config: { token: 'tk', bookName: '我的笔记', baseUrl: 'https://www.yuque.com' },
      tools: { register },
      get: () => undefined,
    } as never
    apply(ctx as never, { token: 'tk', bookName: '我的笔记', baseUrl: 'https://www.yuque.com' } as never)
    expect(register).toHaveBeenCalledTimes(3)
  })

  it('fails loud when token is missing', () => {
    const ctx = {
      config: {},
      tools: { register: vi.fn() },
      get: () => undefined,
    } as never
    expect(() => apply(ctx as never, {} as never)).toThrow(/missing required config "token"/)
  })

  it('does not block when attachment service is absent', () => {
    const register = vi.fn()
    const ctx = {
      config: { token: 'tk' },
      tools: { register },
      get: () => undefined,
    } as never
    apply(ctx as never, { token: 'tk' } as never)
    expect(register).toHaveBeenCalledTimes(3)
  })
})
