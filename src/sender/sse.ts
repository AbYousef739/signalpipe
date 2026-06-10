/**
 * Server-Sent-Events frame parser for the in-plugin sender.
 *
 * A TypeScript port of the daemon's sse.py — identical frame semantics so both
 * senders agree on the wire format byte-for-byte. The only transport concern
 * here is reading the fetch Response body; the frame logic is a pure async
 * generator that can be exercised against a plain async iterable of lines.
 *
 * Nothing in this file scores, drafts, or interprets a mission — it only turns
 * bytes into { event, data } frames.
 */
import { TextDecoder } from 'util'

export interface SseFrame {
  event: string
  data: Record<string, unknown>
}

/**
 * Read a fetch Response body as a stream of text lines.
 *
 * Decodes the byte stream incrementally and splits on newlines, buffering any
 * partial trailing line until the next chunk completes it. Flushes the decoder
 * and any final partial line when the body ends.
 */
export async function* streamLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        yield buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
      }
    }
    buffer += decoder.decode() // flush any multi-byte remainder
    if (buffer) yield buffer
  } finally {
    reader.releaseLock()
  }
}

/**
 * Turn a stream of SSE text lines into { event, data } frames.
 *
 * A frame ends on a blank line. `event:` sets the name (default "message");
 * `data:` lines are concatenated with newlines then JSON-decoded. Comment lines
 * (starting with ":") and id/retry fields are ignored. Malformed JSON is
 * surfaced as { _raw: <text> } rather than silently dropped.
 */
export async function* parseSse(lines: AsyncIterable<string>): AsyncGenerator<SseFrame> {
  let event: string | null = null
  let dataLines: string[] = []
  for await (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (line === '') {
      if (event !== null || dataLines.length > 0) {
        const payload = dataLines.join('\n')
        let data: Record<string, unknown>
        if (payload) {
          try {
            data = JSON.parse(payload) as Record<string, unknown>
          } catch {
            data = { _raw: payload }
          }
        } else {
          data = {}
        }
        yield { event: event || 'message', data }
      }
      event = null
      dataLines = []
      continue
    }
    if (line.startsWith(':')) continue // SSE comment / keep-alive ping
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    let value = idx === -1 ? '' : line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') {
      event = value
    } else if (field === 'data') {
      dataLines.push(value)
    }
    // id / retry fields are intentionally ignored
  }
}
