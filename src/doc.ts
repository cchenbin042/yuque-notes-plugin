import { readFile } from 'node:fs/promises'
import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { detectMediaType, replaceImageRefs, type ImageSource } from './images.ts'
import type { DocCreateResult, YuqueClient } from './yuque.ts'

export interface CreateNoteOptions {
  title: string
  body: string
  namespace: string
  dirUuid?: string
  slug?: string
}

export interface CreateNoteDeps {
  attachments?: Pick<AttachmentStore, 'readImage'>
  cwd?: string
  signal?: AbortSignal
}

/** 图片管线 + 文档创建：任何图片失败都中止，不产生半成品文档。 */
export async function createNote(
  client: YuqueClient,
  repoId: number,
  options: CreateNoteOptions,
  deps: CreateNoteDeps,
): Promise<DocCreateResult & { uploadedImages: number }> {
  const { markdown, uploaded, failed } = await replaceImageRefs(options.body, {
    readAttachment: (id, signal) => readAttachmentImage(deps, id, signal),
    readFile: (path, signal) => readLocalImage(path, deps.cwd, signal),
    upload: (image, signal) => client.uploadImage(image, signal).then(r => r.url),
  }, deps.signal)
  if (failed.length > 0) {
    const refs = failed.map(ref => ref.raw).join(', ')
    throw new Error(`yuque-notes: image upload failed for: ${refs}`)
  }
  const doc = await client.createDoc(repoId, {
    title: options.title,
    body: markdown,
    slug: options.slug,
    namespace: options.namespace,
  }, deps.signal)
  await attachDoc(client, repoId, doc, options.dirUuid, deps.signal)
  return { ...doc, uploadedImages: uploaded.length }
}

/** 把已创建的文档挂载到 TOC；挂载失败时尽力删除文档，不留半成品。 */
async function attachDoc(
  client: YuqueClient,
  repoId: number,
  doc: DocCreateResult,
  dirUuid: string | undefined,
  signal: AbortSignal | undefined,
): Promise<void> {
  try {
    await client.appendDocToToc(repoId, {
      title: doc.title,
      docId: doc.id,
      ...(dirUuid !== undefined && dirUuid !== '' ? { parentUuid: dirUuid } : {}),
    }, signal)
  } catch (cause) {
    try {
      await client.deleteDoc(repoId, doc.slug, signal)
    } catch {
      throw new Error(
        `yuque-notes: doc created but failed to attach to toc (${doc.url}); rollback also failed`,
        { cause },
      )
    }
    throw new Error('yuque-notes: doc created but failed to attach to toc; doc rolled back', { cause })
  }
}

async function readAttachmentImage(
  deps: CreateNoteDeps,
  id: string,
  signal?: AbortSignal,
): Promise<ImageSource> {
  if (deps.attachments === undefined) {
    throw new Error('attachment:// references require the dsh attachment service (not mounted)')
  }
  const ref = { attachmentId: id } as ImageAttachmentRef
  const stored = await deps.attachments.readImage(ref, signal)
  return { data: stored.data, mediaType: stored.ref.mediaType, name: `attachment-${id}` }
}

async function readLocalImage(
  path: string,
  cwd: string | undefined,
  signal?: AbortSignal,
): Promise<ImageSource> {
  const resolved = isAbsolute(path) ? path : joinPath(cwd ?? '', path)
  const data = new Uint8Array(await readFile(resolved, { signal }))
  return { data, mediaType: detectMediaType(resolved), name: basename(resolved) }
}

function isAbsolute(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

function joinPath(cwd: string, path: string): string {
  return `${cwd.replace(/[\\/]+$/, '')}/${path}`
}

function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}
