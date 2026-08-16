const USER_AGENT = 'yuque-notes-plugin/0.1.1'
const MAX_ATTEMPTS = 3

export class YuqueError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message)
    this.name = 'YuqueError'
  }
}

export interface UserInfo {
  login: string
  name: string
}

export interface RepoInfo {
  id: number
  name: string
  slug: string
  namespace: string
}

export interface TocRawNode {
  uuid: string
  title: string
  slug: string
  parent_uuid: string | null
  type: string
}

export interface DocCreateResult {
  id: number
  slug: string
  title: string
  url: string
}

/** 按语雀错误语义归一化：401/403 为鉴权类，404 为缺失类，其余透传状态码。 */
export function normalizeError(status: number, message: string): YuqueError {
  const code = status === 401 || status === 403 ? 'unauthorized' : status === 404 ? 'not-found' : 'yuque-api'
  return new YuqueError(`Yuque API ${status}: ${message}`, code, status)
}

export class YuqueClient {
  readonly #token: string
  readonly #baseUrl: string

  constructor(config: { token: string; baseUrl: string }) {
    this.#token = config.token
    this.#baseUrl = config.baseUrl.replace(/\/+$/, '')
  }

  async getUser(signal?: AbortSignal): Promise<UserInfo> {
    return this.#request('/api/v2/user', { method: 'GET', signal })
  }

  async listRepos(login: string, signal?: AbortSignal): Promise<RepoInfo[]> {
    return this.#request(`/api/v2/users/${login}/repos`, { method: 'GET', signal })
  }

  async createRepo(
    login: string,
    opts: { name: string; slug?: string; description?: string },
    signal?: AbortSignal,
  ): Promise<RepoInfo> {
    return this.#request(`/api/v2/users/${login}/repos`, {
      method: 'POST',
      body: { name: opts.name, slug: opts.slug, description: opts.description, public: 0 },
      signal,
    })
  }

  async getToc(repoId: number, signal?: AbortSignal): Promise<TocRawNode[]> {
    return this.#request(`/api/v2/repos/${repoId}/toc`, { method: 'GET', signal })
  }

  async createTocNode(
    repoId: number,
    opts: { title: string; parentUuid?: string },
    signal?: AbortSignal,
  ): Promise<{ uuid: string; title: string }> {
    const nodes = await this.#request<TocRawNode[]>(`/api/v2/repos/${repoId}/toc`, {
      method: 'PUT',
      body: {
        action: 'appendNode',
        action_mode: 'child',
        title: opts.title,
        type: 'TITLE',
        ...(opts.parentUuid === undefined ? {} : { target_uuid: opts.parentUuid }),
      },
      signal,
    })
    const node = matchTocNode(nodes, 'TITLE', opts.title, opts.parentUuid)
    return { uuid: node.uuid, title: node.title }
  }

  async appendDocToToc(
    repoId: number,
    opts: { title: string; docId: number; parentUuid?: string },
    signal?: AbortSignal,
  ): Promise<TocRawNode> {
    const nodes = await this.#request<TocRawNode[]>(`/api/v2/repos/${repoId}/toc`, {
      method: 'PUT',
      body: {
        action: 'appendNode',
        action_mode: 'child',
        title: opts.title,
        type: 'DOC',
        doc_id: opts.docId,
        ...(opts.parentUuid === undefined ? {} : { target_uuid: opts.parentUuid }),
      },
      signal,
    })
    return matchTocNode(nodes, 'DOC', opts.title, opts.parentUuid)
  }

  async createDoc(
    repoId: number,
    opts: { title: string; body: string; slug?: string | undefined; namespace: string },
    signal?: AbortSignal,
  ): Promise<DocCreateResult> {
    const doc = await this.#request<Omit<DocCreateResult, 'url'>>(`/api/v2/repos/${repoId}/docs`, {
      method: 'POST',
      body: { title: opts.title, body: opts.body, format: 'markdown', slug: opts.slug },
      signal,
    })
    return { ...doc, url: `${this.#baseUrl}/${opts.namespace}/${doc.slug}` }
  }

  async deleteDoc(repoId: number, slug: string, signal?: AbortSignal): Promise<unknown> {
    return this.#request(`/api/v2/repos/${repoId}/docs/${slug}`, { method: 'DELETE', signal })
  }

  async #request<T>(
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal | undefined } = {},
  ): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.#attempt(path, init)
      } catch (error) {
        lastError = error
        if (!(error instanceof YuqueError) || !isRetryable(error.status) || attempt === MAX_ATTEMPTS) {
          throw error
        }
        await sleep(2 ** attempt * 250, init.signal)
      }
    }
    throw lastError
  }

  async #attempt<T>(
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal | undefined },
  ): Promise<T> {
    if (this.#token === '') {
      throw new Error('yuque-notes: YUQUE_TOKEN not configured (set env YUQUE_TOKEN or cordis.yml config token)')
    }
    const headers: Record<string, string> = {
      'X-Auth-Token': this.#token,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    }
    const method = init.method ?? 'GET'
    const response = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      ...(init.signal === undefined ? {} : { signal: init.signal }),
    })
    const payload = (await response.json().catch(() => ({}))) as { message?: unknown; data?: unknown }
    if (!response.ok) {
      throw normalizeError(response.status, typeof payload.message === 'string' ? payload.message : 'request failed')
    }
    return payload.data as T
  }
}

/** 从 appendNode 返回的完整 toc 数组中定位新建节点（parent_uuid 可能为 null 或 ''）。 */
function matchTocNode(
  nodes: TocRawNode[],
  type: 'TITLE' | 'DOC',
  title: string,
  parentUuid: string | undefined,
): TocRawNode {
  const node = nodes.find(
    n => n.type === type && n.title === title && (n.parent_uuid ?? '') === (parentUuid ?? ''),
  )
  if (node === undefined) {
    throw new Error(`yuque-notes: ${type} node not found in toc append response (title: ${title})`)
  }
  return node
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }, { once: true })
  })
}
