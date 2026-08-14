import type { TocRawNode } from './yuque.ts'

export interface TocNode {
  uuid: string
  title: string
  type: 'title' | 'doc'
  parentUuid: string | null
  children: TocNode[]
}

function toNode(raw: TocRawNode): TocNode {
  return {
    uuid: raw.uuid,
    title: raw.title,
    type: raw.type === 'TITLE' ? 'title' : 'doc',
    parentUuid: raw.parent_uuid,
    children: [],
  }
}

/** 平铺目录节点组树；父缺失的节点提升到根层（孤儿可见优于丢失）。 */
export function buildTocTree(raw: readonly TocRawNode[]): TocNode[] {
  const nodes = new Map<string, TocNode>()
  for (const item of raw) nodes.set(item.uuid, toNode(item))
  const roots: TocNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentUuid === null ? undefined : nodes.get(node.parentUuid)
    if (parent === undefined) {
      node.parentUuid = null
      roots.push(node)
    } else {
      parent.children.push(node)
    }
  }
  for (const node of nodes.values()) {
    node.children.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  }
  roots.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  return roots
}

/** 缩进目录树文本，供模型阅读分类。 */
export function renderTocTree(tree: readonly TocNode[], indent = ''): string {
  const lines: string[] = []
  for (const node of tree) {
    const icon = node.type === 'title' ? '📁' : '📄'
    lines.push(`${indent}${icon} ${node.title}`)
    lines.push(renderTocTree(node.children, `${indent}  `))
  }
  return lines.join('\n').trimEnd()
}
