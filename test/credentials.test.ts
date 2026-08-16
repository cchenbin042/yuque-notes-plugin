import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { resolveCredential } from '../src/credentials.ts'

afterEach(() => vi.unstubAllEnvs())

const stubCtx = (get: (key: string) => unknown): Context => ({ get }) as unknown as Context

describe('resolveCredential', () => {
  it('resolves through the credentials seam when it is present', async () => {
    const resolve = vi.fn().mockResolvedValue({ value: 'tk_file', source: 'file' })
    const value = await resolveCredential(stubCtx(() => ({ resolve })), 'YUQUE_TOKEN', '语雀 token')
    expect(value).toBe('tk_file')
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({}))
  })

  it('falls back to the launch environment when the seam is absent', async () => {
    vi.stubEnv('YUQUE_TOKEN', 'tk_env')
    const value = await resolveCredential(stubCtx(() => undefined), 'YUQUE_TOKEN', '语雀 token')
    expect(value).toBe('tk_env')
  })

  it('throws a guidance error when neither seam nor environment has the ref', async () => {
    const resolve = vi.fn().mockResolvedValue(undefined)
    await expect(
      resolveCredential(stubCtx(() => ({ resolve })), 'YUQUE_TOKEN', '语雀 token'),
    ).rejects.toThrow(/YUQUE_TOKEN.*\$DSH_HOME\/\.credentials\.yaml/s)
  })

  it('throws when the seam resolves an empty value (blank never masquerades)', async () => {
    const resolve = vi.fn().mockResolvedValue({ value: '', source: 'file' })
    await expect(
      resolveCredential(stubCtx(() => ({ resolve })), 'YUQUE_TOKEN', '语雀 token'),
    ).rejects.toThrow(/未配置语雀 token/)
  })

  it('rejects a malformed ref name', async () => {
    await expect(
      resolveCredential(stubCtx(() => undefined), 'not a ref', '语雀 token'),
    ).rejects.toThrow(/must match/)
  })
})
