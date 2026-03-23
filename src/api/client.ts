import { API_URL, authHeaders } from '../config'

async function request(method: string, path: string, body?: object): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
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
}

export const api = {
  get:  (path: string)                  => request('GET',  path),
  post: (path: string, body?: object)   => request('POST', path, body),
}
