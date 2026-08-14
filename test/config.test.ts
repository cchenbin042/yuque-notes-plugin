import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.ts'

describe('resolveConfig', () => {
  it('fills defaults for bookName and baseUrl', () => {
    const config = resolveConfig({ token: 'tk_123' })
    expect(config).toEqual({ token: 'tk_123', bookName: '我的笔记', baseUrl: 'https://www.yuque.com' })
  })

  it('keeps caller values', () => {
    const config = resolveConfig({ token: 'tk', bookName: '工作笔记', baseUrl: 'https://yuque.example.com' })
    expect(config.bookName).toBe('工作笔记')
    expect(config.baseUrl).toBe('https://yuque.example.com')
  })

  it('throws when token is missing', () => {
    expect(() => resolveConfig({})).toThrow(/missing required config "token"/)
  })

  it('throws when token is empty', () => {
    expect(() => resolveConfig({ token: '  ' })).toThrow(/missing required config "token"/)
  })

  it('exposes DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.bookName).toBe('我的笔记')
    expect(DEFAULT_CONFIG.baseUrl).toBe('https://www.yuque.com')
  })
})
