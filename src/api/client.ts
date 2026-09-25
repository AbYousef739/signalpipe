import { API_URL, authHeaders } from '../config'

const API_TIMEOUT_MS = 10_000  // 10 seconds for ordinary backend calls

// Calls that wait on the brain's three judges need longer: one panel is three
// model calls (with retries), and a feed preview runs up to twelve panels in a
// row. A 10-second abort used to cut those off mid-judgement.
export const PANEL_TIMEOUT_MS = 60_000
export const PREVIEW_TIMEOUT_MS = 240_000

export interface RequestOptions { timeoutMs?: number }

async function request(method: string, path: string, body?: object, opts: RequestOptions = {}): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? API_TIMEOUT_MS)

  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    const text = await res.text()

    if (!res.ok) {
      throw new Error(`SignalPipe API ${method} ${path} → ${res.status}: ${text}`)
    }

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  get:    (path: string, opts?: RequestOptions)                => request('GET',    path, undefined, opts),
  post:   (path: string, body?: object, opts?: RequestOptions) => request('POST',   path, body, opts),
  delete: (path: string, opts?: RequestOptions)                => request('DELETE', path, undefined, opts),
}
