import { describe, expect, it } from 'vitest'
import { detectMediaType, parseImageRefs, replaceImageRefs } from '../src/images.ts'

describe('parseImageRefs', () => {
  it('extracts attachment and file refs', () => {
    const md = '![a](attachment://abc123) 见下图 ![b](/tmp/x.png)'
    const { refs, invalid } = parseImageRefs(md)
    expect(refs).toEqual([
      { kind: 'attachment', raw: 'attachment://abc123', id: 'abc123' },
      { kind: 'file', raw: '/tmp/x.png', id: '/tmp/x.png' },
    ])
    expect(invalid).toEqual([])
  })

  it('ignores http(s) urls', () => {
    const { refs } = parseImageRefs('![a](https://example.com/x.png)')
    expect(refs).toEqual([])
  })

  it('reports empty references as invalid', () => {
    const { refs, invalid } = parseImageRefs('![](  )')
    expect(refs).toEqual([])
    expect(invalid).toHaveLength(1)
  })
})

describe('detectMediaType', () => {
  it('maps known extensions', () => {
    expect(detectMediaType('a.png')).toBe('image/png')
    expect(detectMediaType('a.JPG')).toBe('image/jpeg')
    expect(detectMediaType('a.webp')).toBe('image/webp')
  })
  it('falls back for unknown', () => {
    expect(detectMediaType('a.xyz')).toBe('application/octet-stream')
  })
})

describe('replaceImageRefs', () => {
  it('replaces refs with uploaded urls', async () => {
    const result = await replaceImageRefs('![a](/tmp/a.png)', {
      readFile: async () => ({ data: new Uint8Array([1]), mediaType: 'image/png', name: 'a.png' }),
      readAttachment: async () => ({ data: new Uint8Array([1]), mediaType: 'image/png', name: 'a.png' }),
      upload: async () => 'https://cdn.yuque.com/a.png',
    })
    expect(result.markdown).toBe('![a](https://cdn.yuque.com/a.png)')
    expect(result.uploaded).toHaveLength(1)
    expect(result.failed).toEqual([])
  })

  it('collects failures and keeps original text', async () => {
    const result = await replaceImageRefs('![a](/tmp/a.png)', {
      readFile: async () => { throw new Error('not found') },
      readAttachment: async () => { throw new Error('nope') },
      upload: async () => 'https://x',
    })
    expect(result.markdown).toBe('![a](/tmp/a.png)')
    expect(result.failed).toHaveLength(1)
  })

  it('reports empty references as invalid and never uploads', async () => {
    const result = await replaceImageRefs('![](  )', {
      readFile: async () => ({ data: new Uint8Array([1]), mediaType: 'image/png', name: 'a.png' }),
      readAttachment: async () => ({ data: new Uint8Array([1]), mediaType: 'image/png', name: 'a.png' }),
      upload: async () => 'https://cdn.yuque.com/a.png',
    })
    expect(result.markdown).toBe('![](  )')
    expect(result.uploaded).toEqual([])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.kind).toBe('invalid')
    expect(result.failed[0]!.raw).toBe('![](  )')
  })
})
