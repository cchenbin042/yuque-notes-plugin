import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG, DEFAULT_GITHUB_TOKEN_ENV, DEFAULT_TOKEN_ENV, resolveConfig,
} from '../src/config.ts'

describe('resolveConfig', () => {
  it('fills defaults for tokenEnv, bookName and baseUrl', () => {
    const config = resolveConfig({ tokenEnv: 'TK_ENV' })
    expect(config).toEqual({ tokenEnv: 'TK_ENV', bookName: '我的笔记', baseUrl: 'https://www.yuque.com' })
  })

  it('keeps caller values', () => {
    const config = resolveConfig({ tokenEnv: 'TK', bookName: '工作笔记', baseUrl: 'https://yuque.example.com' })
    expect(config.tokenEnv).toBe('TK')
    expect(config.bookName).toBe('工作笔记')
    expect(config.baseUrl).toBe('https://yuque.example.com')
  })

  it('defaults tokenEnv when missing (lazy resolution at call time)', () => {
    expect(resolveConfig({}).tokenEnv).toBe(DEFAULT_TOKEN_ENV)
  })

  it('defaults imageHosting.tokenEnv to GITHUB_TOKEN', () => {
    const config = resolveConfig({ imageHosting: { provider: 'github', repo: 'a/b' } })
    expect(config.imageHosting?.tokenEnv).toBe(DEFAULT_GITHUB_TOKEN_ENV)
  })

  it('keeps caller imageHosting.tokenEnv', () => {
    const config = resolveConfig({ imageHosting: { provider: 'github', repo: 'a/b', tokenEnv: 'GH_TOKEN' } })
    expect(config.imageHosting?.tokenEnv).toBe('GH_TOKEN')
  })

  it('rejects unsupported hosting providers', () => {
    expect(() => resolveConfig({ imageHosting: { provider: 's3' as never, repo: 'a/b' } }))
      .toThrow(/unsupported image hosting provider/)
  })

  it('exposes DEFAULT_CONFIG', () => {
    expect(DEFAULT_CONFIG.bookName).toBe('我的笔记')
    expect(DEFAULT_CONFIG.baseUrl).toBe('https://www.yuque.com')
  })
})
