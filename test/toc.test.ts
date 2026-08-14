import { describe, expect, it } from 'vitest'
import { buildTocTree, renderTocTree, type TocNode } from '../src/toc.ts'

describe('buildTocTree', () => {
  it('builds a two-level tree from flat nodes', () => {
    const raw = [
      { uuid: 'root', title: '前端', slug: 'fe', parent_uuid: null, type: 'TITLE' },
      { uuid: 'leaf', title: 'React 笔记', slug: 'react', parent_uuid: 'root', type: 'DOC' },
    ]
    const tree = buildTocTree(raw)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.children).toHaveLength(1)
    expect(tree[0]?.children[0]?.type).toBe('doc')
  })

  it('promotes orphans to root', () => {
    const raw = [{ uuid: 'orphan', title: 'x', slug: 'x', parent_uuid: 'missing', type: 'DOC' }]
    const tree = buildTocTree(raw)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.parentUuid).toBeNull()
  })

  it('sorts children by title for stable output', () => {
    const raw = [
      { uuid: 'r', title: 'B', slug: 'b', parent_uuid: null, type: 'TITLE' },
      { uuid: 'a', title: 'A', slug: 'a', parent_uuid: null, type: 'TITLE' },
    ]
    expect(buildTocTree(raw).map(n => n.title)).toEqual(['A', 'B'])
  })
})

describe('renderTocTree', () => {
  it('renders an indented outline', () => {
    const tree: TocNode[] = [
      {
        uuid: 'r', title: '前端', type: 'title', parentUuid: null,
        children: [{ uuid: 'l', title: 'React 笔记', type: 'doc', parentUuid: 'r', children: [] }],
      },
    ]
    expect(renderTocTree(tree)).toBe('📁 前端\n  📄 React 笔记')
  })

  it('returns empty string for empty tree', () => {
    expect(renderTocTree([])).toBe('')
  })
})
