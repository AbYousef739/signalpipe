// Client-side reading tests. No network, no dependencies: Node's own runner.
//   npm test        (compiles with tsc, then runs node --test test/*.test.js)
'use strict'
// The plugin's config refuses to load without these (by design); the tests
// never make a real request, so placeholders are enough.
process.env.SIGNALPIPE_API_URL = process.env.SIGNALPIPE_API_URL || 'http://127.0.0.1:9'
process.env.SIGNALPIPE_OPERATOR_KEY = process.env.SIGNALPIPE_OPERATOR_KEY || 'test-key'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseFeed, decodeEntities } = require('../dist/reader/feed')
const { readOnce, clientStations, ReaderManager, FEED_DELAY_MS } = require('../dist/reader/manager')

// Shaped like a Reddit /new/.rss (Atom) feed: HTML content entity-encoded,
// author as /u/name, link as an href attribute.
const REDDIT_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<category term="smallbusiness" label="r/smallbusiness"/>
<entry>
  <author><name>/u/buyer_one</name><uri>https://www.reddit.com/user/buyer_one</uri></author>
  <category term="smallbusiness" label="r/smallbusiness"/>
  <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class=&quot;md&quot;&gt;&lt;p&gt;Our help desk renewal is in March &amp;amp; the quote went up.&lt;/p&gt;&lt;/div&gt;</content>
  <id>t3_abc123</id>
  <link href="https://www.reddit.com/r/smallbusiness/comments/abc123/need_a_help_desk/" />
  <updated>2026-09-25T09:00:00+00:00</updated>
  <published>2026-09-25T08:55:00+00:00</published>
  <title>Need a help desk for 40 agents &amp; a shared inbox</title>
</entry>
<entry>
  <author><name>/u/second</name></author>
  <content type="html">&lt;p&gt;tips?&lt;/p&gt;</content>
  <link href="https://www.reddit.com/r/smallbusiness/comments/def456/tips/" />
  <updated>2026-09-25T08:00:00+00:00</updated>
  <title>Tips for getting customers?</title>
</entry>
</feed>`

// Shaped like hnrss.org (RSS 2.0): CDATA, dc:creator, RFC 822 dates.
const HN_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel><title>Hacker News: Newest</title><atom:link href="https://hnrss.org/newest" rel="self"/>
<item>
<title><![CDATA[Ask HN: What help desk do small teams use?]]></title>
<description><![CDATA[<p>We are 12 people & switching.</p>]]></description>
<pubDate>Thu, 25 Sep 2026 09:00:00 +0000</pubDate>
<link>https://news.ycombinator.com/item?id=123</link>
<dc:creator>someone</dc:creator>
<guid isPermaLink="false">https://news.ycombinator.com/item?id=123</guid>
</item>
</channel></rss>`

// A Google Alerts-style Atom entry (the link carries &amp; in its href) and
// an RSS item with no <link>, only a permalink guid and content:encoded.
const ALERT_ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title type="html">Looking for a &lt;b&gt;help desk&lt;/b&gt; alternative</title>
<link href="https://www.google.com/url?rct=j&amp;url=https://forum.example.com/t/1&amp;ct=ga"/>
<published>2026-09-25T07:00:00Z</published><content type="html">snippet</content>
</entry></feed>`
const GUID_RSS = `<rss><channel><item><title>Guid only</title>
<guid>https://blog.example.com/post/9</guid>
<content:encoded><![CDATA[<p>full body</p>]]></content:encoded>
<description>short</description><author>writer@example.com (Writer)</author>
</item><item><title>No link at all</title><description>skip</description></item></channel></rss>`

test('Reddit-style Atom: link, title, HTML content, author, dates', () => {
  const [a, b] = parseFeed(REDDIT_ATOM)
  assert.equal(a.link, 'https://www.reddit.com/r/smallbusiness/comments/abc123/need_a_help_desk/')
  assert.equal(a.title, 'Need a help desk for 40 agents & a shared inbox')
  assert.ok(a.summary.includes('<p>Our help desk renewal is in March &amp; the quote went up.</p>'))
  assert.equal(a.author, '/u/buyer_one')
  assert.equal(a.published, '2026-09-25T08:55:00.000Z')          // published preferred over updated
  assert.equal(b.published, '2026-09-25T08:00:00.000Z')          // falls back to updated
})

test('HN-style RSS: CDATA, dc:creator, RFC 822 date', () => {
  const [e] = parseFeed(HN_RSS)
  assert.deepEqual(e, {
    link: 'https://news.ycombinator.com/item?id=123',
    title: 'Ask HN: What help desk do small teams use?',
    summary: '<p>We are 12 people & switching.</p>',
    author: 'someone',
    published: '2026-09-25T09:00:00.000Z',
  })
})

test('attribute entities, guid permalinks, content:encoded, and link-less items', () => {
  const [alert] = parseFeed(ALERT_ATOM)
  assert.equal(alert.link, 'https://www.google.com/url?rct=j&url=https://forum.example.com/t/1&ct=ga')
  assert.equal(alert.title, 'Looking for a <b>help desk</b> alternative')
  const items = parseFeed(GUID_RSS)
  assert.equal(items.length, 1)
  assert.equal(items[0].link, 'https://blog.example.com/post/9')
  assert.equal(items[0].summary, '<p>full body</p>')
  assert.equal(items[0].author, 'writer@example.com (Writer)')
  assert.equal(items[0].published, null)
})

test('a page is capped, and junk input yields nothing', () => {
  const many = '<rss><channel>' + Array.from({ length: 80 }, (_, i) =>
    `<item><title>p${i}</title><link>https://x.example/${i}</link></item>`).join('') + '</channel></rss>'
  assert.equal(parseFeed(many).length, 50)
  assert.deepEqual(parseFeed(''), [])
  assert.deepEqual(parseFeed('not xml at all'), [])
})

test('decodeEntities handles named and numeric forms and leaves unknowns alone', () => {
  assert.equal(decodeEntities('&lt;a&gt; &amp; &quot;q&quot; &#39;s&#x27; &#8212; &bogus;'), '<a> & "q" \'s\' — &bogus;')
})

// ── the reading loop ────────────────────────────────────────────────────────
const STATIONS = [
  { id: 's1', name: 'r/smallbusiness', rss_url: 'https://www.reddit.com/r/smallbusiness/new/.rss', read_by: 'client', active: true },
  { id: 's2', name: 'HN', rss_url: 'https://hnrss.org/newest?q=help', read_by: 'server', active: true },
  { id: 's3', name: 'forum', rss_url: 'https://forum.example.com/latest.rss', read_by: 'client' },
  { id: 's4', name: 'paused', rss_url: 'https://forum.example.com/x.rss', read_by: 'client', active: false },
]

function fakeDeps(overrides = {}) {
  const calls = { fetched: [], ingested: [], slept: [], logs: [] }
  const deps = {
    listStations: async () => STATIONS,
    fetchText: async (url) => { calls.fetched.push(url); return url.includes('reddit') ? REDDIT_ATOM : HN_RSS },
    ingest: async (id, entries) => { calls.ingested.push([id, entries]); return { status: 'accepted', entries: entries.length } },
    sleep: async (ms) => { calls.slept.push(ms) },
    log: (m) => calls.logs.push(m),
    ...overrides,
  }
  return { deps, calls }
}

test('only active client stations are read', () => {
  assert.deepEqual(clientStations(STATIONS).map((s) => s.id), ['s1', 's3'])
})

test('readOnce fetches the client feeds from here and sends each page', async () => {
  const { deps, calls } = fakeDeps()
  const counts = await readOnce(deps)
  assert.deepEqual(calls.fetched, [STATIONS[0].rss_url, STATIONS[2].rss_url])   // never the server's feed
  assert.deepEqual(calls.slept, [FEED_DELAY_MS])
  assert.deepEqual(calls.ingested.map(([id]) => id), ['s1', 's3'])
  assert.equal(calls.ingested[0][1][0].author, '/u/buyer_one')
  assert.deepEqual(counts, { stations: 2, sent: 2, entries: 3, empty: 0, skipped: 0, errors: 0 })
})

test('readOnce counts cooldowns, empty feeds and errors, and carries on', async () => {
  const { deps, calls } = fakeDeps({
    fetchText: async (url) => { if (url.includes('reddit')) return '<feed></feed>'; throw new Error('feed returned 503') },
  })
  const counts = await readOnce(deps)
  assert.equal(counts.empty, 1)
  assert.equal(counts.errors, 1)
  assert.ok(calls.logs.some((m) => m.includes('503')))

  const cooled = fakeDeps({ ingest: async () => ({ status: 'skipped', reason: 'cooldown', retry_after_s: 90 }) })
  const c2 = await readOnce(cooled.deps)
  assert.equal(c2.skipped, 2)
  assert.ok(cooled.calls.logs.some((m) => m.includes('cooldown') && m.includes('90s')))
})

test('nothing marked for this machine means nothing is fetched', async () => {
  const { deps, calls } = fakeDeps({ listStations: async () => STATIONS.filter((s) => s.read_by === 'server') })
  const counts = await readOnce(deps)
  assert.equal(counts.stations, 0)
  assert.deepEqual(calls.fetched, [])
})

test('the manager reports passes, refuses to double up, and starts and stops cleanly', async () => {
  const { deps } = fakeDeps()
  const m = new ReaderManager(deps)
  const [first, second] = await Promise.all([m.readOnce(), m.readOnce()])
  assert.equal(second.status, 'busy')
  assert.equal(first.sent, 2)
  assert.equal(m.status().passes, 1)
  const started = m.start(5)                       // below the floor: raised to 10
  assert.equal(started.every_minutes, 10)
  assert.equal(m.status().running, true)
  assert.equal(m.stop().status, 'stopped')
  assert.equal(m.status().running, false)
  assert.equal(m.stop().status, 'not_running')
})
