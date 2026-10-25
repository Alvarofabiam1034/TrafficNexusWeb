import { DomainError, type DomainErrorKind } from '@/domain/errors'

export interface TokenProvider {
  token(): string | null
  /** Se llama cuando el servidor rechaza el token: la sesión ya no sirve. */
  onUnauthorized(): void
}

interface RequestOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  readonly path: string
  readonly body?: unknown
  readonly query?: Record<string, string | undefined>
  readonly signal?: AbortSignal
}

interface ErrorBody {
  error?: string
  code?: string
}

const REQUEST_TIMEOUT_MS = 30_000

/**
 * Único punto que conoce `fetch`. Agrega el Bearer, serializa JSON y traduce
 * cualquier respuesta no exitosa a `DomainError`.
 */
export class HttpClient {
  private readonly baseUrl: string

  constructor(
    baseUrl: string,
    private readonly tokens: TokenProvider,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  get<T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal): Promise<T> {
    return this.request<T>({ method: 'GET', path, query, signal })
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'POST', path, body })
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PUT', path, body })
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, body })
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>({ method: 'DELETE', path })
  }

  private async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query)
    const headers = new Headers({ Accept: 'application/json' })
    if (options.body !== undefined) headers.set('Content-Type', 'application/json')
    const token = this.tokens.token()
    if (token) headers.set('Authorization', `Bearer ${token}`)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    options.signal?.addEventListener('abort', () => controller.abort(), { once: true })

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch (error) {
      clearTimeout(timer)
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new DomainError('NETWORK', 'La solicitud tardó demasiado')
      }
      throw new DomainError('NETWORK', 'No se pudo conectar con el servidor')
    }
    clearTimeout(timer)

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      if (response.ok) return undefined as T
    }

    const text = await response.text()
    const parsed = text ? safeJson(text) : undefined

    if (!response.ok) {
      const body = (parsed ?? {}) as ErrorBody
      const kind = kindOf(response.status, body.code)
      if (response.status === 401 && token) this.tokens.onUnauthorized()
      throw new DomainError(kind, body.error || defaultMessage(kind), response.status)
    }
    return parsed as T
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const clean = path.startsWith('/') ? path : `/${path}`
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== '') params.set(key, value)
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : ''
    return `${this.baseUrl}${clean}${suffix}`
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function kindOf(status: number, code?: string): DomainErrorKind {
  switch (code) {
    case 'INVALID':
      return 'INVALID'
    case 'UNAUTHORIZED':
      return 'UNAUTHORIZED'
    case 'FORBIDDEN':
      return 'FORBIDDEN'
    case 'NOT_FOUND':
      return 'NOT_FOUND'
    case 'CONFLICT':
      return 'CONFLICT'
  }
  if (status === 400) return 'INVALID'
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  return 'UNKNOWN'
}

function defaultMessage(kind: DomainErrorKind): string {
  switch (kind) {
    case 'INVALID':
      return 'Los datos no son válidos'
    case 'UNAUTHORIZED':
      return 'La sesión no es válida'
    case 'FORBIDDEN':
      return 'No tienes permiso para esta acción'
    case 'NOT_FOUND':
      return 'No existe'
    case 'CONFLICT':
      return 'La operación entra en conflicto con el estado actual'
    case 'NETWORK':
      return 'No se pudo conectar con el servidor'
    case 'UNKNOWN':
      return 'Error interno del servidor'
  }
}
