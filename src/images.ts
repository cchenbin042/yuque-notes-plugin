export interface ImageRef {
  kind: 'attachment' | 'file' | 'invalid'
  raw: string
  id: string
}

export interface FailedImageRef extends ImageRef {
  /** 读取或上传阶段的原始错误；invalid 引用无 */
  error?: unknown
}

export interface ImageRefResult {
  refs: ImageRef[]
  invalid: string[]
}

export interface ImageSource {
  data: Uint8Array
  mediaType: string
  name: string
}

export interface ImageDeps {
  readAttachment: (id: string, signal?: AbortSignal) => Promise<ImageSource>
  readFile: (path: string, signal?: AbortSignal) => Promise<ImageSource>
  upload: (image: ImageSource, signal?: AbortSignal) => Promise<string>
}

const IMAGE_REF = /!\[[^\]]*\]\(([^)]+)\)/g
const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export function detectMediaType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return MEDIA_TYPES[ext] ?? 'application/octet-stream'
}

/** 提取 Markdown 图片引用：attachment://<id> 与本地路径；外链 URL 跳过。 */
export function parseImageRefs(markdown: string): ImageRefResult {
  const refs: ImageRef[] = []
  const invalid: string[] = []
  for (const match of markdown.matchAll(IMAGE_REF)) {
    const raw = match[1]?.trim() ?? ''
    if (raw === '') {
      invalid.push(match[0])
    } else if (raw.startsWith('attachment://')) {
      refs.push({ kind: 'attachment', raw, id: raw.slice('attachment://'.length) })
    } else if (!/^https?:\/\//.test(raw)) {
      refs.push({ kind: 'file', raw, id: raw })
    }
  }
  return { refs, invalid }
}

/** 读取→上传→替换全部图片引用；失败项保留原文并回报，由调用方决定中止。 */
export async function replaceImageRefs(
  markdown: string,
  deps: ImageDeps,
  signal?: AbortSignal,
): Promise<{ markdown: string; uploaded: ImageRef[]; failed: FailedImageRef[] }> {
  const { refs, invalid } = parseImageRefs(markdown)
  const uploaded: ImageRef[] = []
  const failed: FailedImageRef[] = [...invalid.map(raw => ({ kind: 'invalid' as const, raw, id: raw }))]
  let result = markdown
  for (const ref of refs) {
    try {
      const source = ref.kind === 'attachment'
        ? await deps.readAttachment(ref.id, signal)
        : await deps.readFile(ref.id, signal)
      const url = await deps.upload(source, signal)
      result = result.split(ref.raw).join(url)
      uploaded.push(ref)
    } catch (error) {
      failed.push({ ...ref, error })
    }
  }
  return { markdown: result, uploaded, failed }
}
