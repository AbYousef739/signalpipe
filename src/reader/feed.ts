/**
 * A small, dependency-free RSS 2.0 / Atom reader for client-side reading.
 *
 * It extracts only what the brain reads from each post: link, title, summary,
 * author and published date. No XML library is pulled in on purpose: this
 * plugin runs inside your agent, and every line of it should stay auditable.
 * It handles CDATA, XML entities, Atom's attribute-style links, RSS
 * content:encoded / dc:creator, and RFC 822 or ISO dates.
 */

export interface FeedEntry {
  link: string
  title: string
  summary: string
  author: string
  published: string | null
}

const MAX_FEED_CHARS = 5_000_000   // refuse anything absurd rather than parse it

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === '#') {
      const cp = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole
    }
    return NAMED[ent.toLowerCase()] ?? whole
  })
}

/** Element text: CDATA is literal, everything else is entity-decoded. */
function textOf(raw: string): string {
  let out = ''
  let last = 0
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/g
  let m: RegExpExecArray | null
  while ((m = cdata.exec(raw))) {
    out += decodeEntities(raw.slice(last, m.index)) + m[1]
    last = cdata.lastIndex
  }
  return (out + decodeEntities(raw.slice(last))).trim()
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Raw inner XML of the first <name ...>...</name> in the block, or null. */
function inner(block: string, name: string): string | null {
  const n = escapeName(name)
  const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i'))
  return m ? m[1] : null
}

/** Text of the first of these elements present in the block. */
function field(block: string, names: string[]): string {
  for (const name of names) {
    const raw = inner(block, name)
    if (raw !== null) return textOf(raw)
  }
  return ''
}

function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${escapeName(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return m ? decodeEntities(m[1] ?? m[2] ?? '') : null
}

/** Atom: the alternate (or rel-less) link's href. */
function atomLink(block: string): string {
  for (const m of block.matchAll(/<link\b([^>]*?)\/?>/gi)) {
    const rel = attr(m[1], 'rel')
    const href = attr(m[1], 'href')
    if (href && (!rel || rel === 'alternate')) return href.trim()
  }
  return ''
}

function isoDate(value: string): string | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Parse an RSS 2.0 or Atom document into the entries the brain reads. */
export function parseFeed(xml: string, limit = 50): FeedEntry[] {
  if (!xml || xml.length > MAX_FEED_CHARS) return []
  const atom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const pattern = atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi
  const out: FeedEntry[] = []
  for (const m of xml.matchAll(pattern)) {
    if (out.length >= limit) break
    const b = m[0]
    let link: string
    let author: string
    let summary: string
    let published: string | null
    if (atom) {
      link = atomLink(b)
      const authorBlock = inner(b, 'author')
      author = authorBlock !== null ? field(authorBlock, ['name']) : ''
      summary = field(b, ['content', 'summary'])
      published = isoDate(field(b, ['published', 'updated']))
    } else {
      link = field(b, ['link'])
      if (!isHttp(link)) {
        const guid = b.match(/<guid\b([^>]*)>([\s\S]*?)<\/guid>/i)
        if (guid && attr(guid[1], 'isPermaLink') !== 'false' && isHttp(textOf(guid[2]))) link = textOf(guid[2])
      }
      author = field(b, ['dc:creator', 'author'])
      summary = field(b, ['content:encoded', 'description'])
      published = isoDate(field(b, ['pubDate', 'dc:date']))
    }
    if (!isHttp(link)) continue
    out.push({ link, title: field(b, ['title']), summary, author, published })
  }
  return out
}
