import { afterEach, describe, expect, it, vi } from 'vitest'
import { YuqueClient } from '../src/yuque.ts'

const client = new YuqueClient({ token: async () => 'tk_test', baseUrl: 'https://www.yuque.com' })

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('YuqueClient request core', () => {
  it('sends auth, user-agent, and JSON headers', async () => {
    const fn = stubFetch(200, { data: { login: 'alice' } })
    await client.getUser()
    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://www.yuque.com/api/v2/user')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Auth-Token']).toBe('tk_test')
    expect(headers['User-Agent']).toBe('yuque-notes-plugin/0.1.2')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('returns data on success', async () => {
    stubFetch(200, { data: { login: 'alice' } })
    await expect(client.getUser()).resolves.toEqual({ login: 'alice' })
  })

  it('normalizes 401 into YuqueError', async () => {
    stubFetch(401, { message: 'bad token' })
    await expect(client.getUser()).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
  })

  it('retries on 429 and succeeds', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ message: 'rate limited' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: { login: 'alice' } }) })
    vi.stubGlobal('fetch', fn)
    await expect(client.getUser()).resolves.toEqual({ login: 'alice' })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('gives up after retry budget for 500', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'boom' }) })
    vi.stubGlobal('fetch', fn)
    await expect(client.getUser()).rejects.toMatchObject({ status: 500 })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('aborts when signal fires', async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal
        // 与真实 fetch 一致：signal 已 aborted 时立即失败，未 abort 才挂起等事件
        if (signal?.aborted === true) {
          reject(new DOMException('aborted', 'AbortError'))
        } else {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }
      })
    })
    vi.stubGlobal('fetch', fn)
    const promise = client.getUser(controller.signal)
    controller.abort()
    await expect(promise).rejects.toThrow('aborted')
  })

  it('throws on network failure without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fn)
    await expect(client.getUser()).rejects.toThrow('fetch failed')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
