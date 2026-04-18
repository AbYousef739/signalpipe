import { API_URL, authHeaders } from '../config'

const API_TIMEOUT_MS = 10_000  // 10 seconds for backend calls

async function request(method: string, path: string, body?: object): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

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
  get:  (path: string)                  => request('GET',  path),
  post: (path: string, body?: object)   => request('POST', path, body),
}
