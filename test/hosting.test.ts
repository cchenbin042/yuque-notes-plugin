import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGithubUploader } from '../src/hosting.ts'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(data: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => data })
  vi.stubGlobal('fetch', fn)
  return fn
}

const image = { data: new Uint8Array([1, 2, 3]), mediaType: 'image/png', name: 'x.png' }

describe('createGithubUploader', () => {
  it('uploads to the contents API and returns a jsdelivr url by default', async () => {
    const fn = stubFetch({})
    const upload = createGithubUploader({ repo: 'alice/img', token: async () => 'tk' })
    const url = await upload(image)
    const [target, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(target).toMatch(/^https:\/\/api\.github\.com\/repos\/alice\/img\/contents\/images\/[0-9a-f]{16}\.png$/)
    expect(init.method).toBe('PUT')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tk')
    expect(headers['User-Agent']).toBe('yuque-notes-plugin')
    const body = JSON.parse(init.body as string) as { message: string; content: string }
    expect(body.message).toMatch(/^chore: upload image/)
    expect(body.content).toBe(Buffer.from(image.data).toString('base64'))
    const name = target.split('/').pop()
    expect(url).toBe(`https://cdn.jsdelivr.net/gh/alice/img@main/images/${name}`)
  })

  it('uses branch, basePath and raw cdn when configured', async () => {
    const fn = stubFetch({})
    const upload = createGithubUploader({ repo: 'alice/img', token: async () => 'tk', branch: 'dev', basePath: 'pdfs', cdn: 'raw' })
    const url = await upload(image)
    const [target] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(target).toMatch(/\/contents\/pdfs\/[0-9a-f]{16}\.png$/)
    const name = target.split('/').pop()
    expect(url).toBe(`https://raw.githubusercontent.com/alice/img/dev/pdfs/${name}`)
  })

  it('throws fail-loud on github error responses', async () => {
    stubFetch({ message: 'Bad credentials' }, false, 401)
    const upload = createGithubUploader({ repo: 'alice/img', token: async () => 'bad' })
    await expect(upload(image)).rejects.toThrow(/github upload failed \(401\): Bad credentials/)
  })

  it('throws on invalid repo format at creation time', () => {
    expect(() => createGithubUploader({ repo: 'noslash', token: async () => 'tk' })).toThrow(/expected "owner\/repo"/)
  })

  it('resolves token per upload and fails loud without network when resolution throws', async () => {
    const fn = stubFetch({})
    const token = vi.fn().mockRejectedValue(new Error('yuque-notes: 未配置图床 token'))
    const upload = createGithubUploader({ repo: 'alice/img', token })
    await expect(upload(image)).rejects.toThrow(/未配置图床 token/)
    expect(token).toHaveBeenCalledTimes(1)
    expect(fn).not.toHaveBeenCalled()
  })
})
