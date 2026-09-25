// Tool surface + feed preview tests. No network, no dependencies: Node's own runner.
//   npm test        (compiles with tsc, then runs node --test test/*.test.js)
'use strict'
process.env.SIGNALPIPE_API_URL = process.env.SIGNALPIPE_API_URL || 'http://127.0.0.1:9'
process.env.SIGNALPIPE_OPERATOR_KEY = process.env.SIGNALPIPE_OPERATOR_KEY || 'test-key'
const test = require('node:test')
const assert = require('node:assert/strict')
const { register } = require('../dist/index')
const { previewFeed } = require('../dist/reader/preview')

function registered() {
  const tools = []
  const quiet = console.log
  console.log = () => {}
  try { register({ registerTool: (t) => tools.push(t) }) } finally { console.log = quiet }
  return tools
}

test('29 tools register, each with a unique name, a description and parameters', () => {
  const tools = registered()
  const names = tools.map((t) => t.name)
  assert.equal(tools.length, 29)
  assert.equal(new Set(names).size, 29, 'duplicate tool names')
  for (const t of tools) {
    assert.match(t.name, /^signalpipe_[a-z_]+$/)
    assert.ok(t.description && t.description.length > 40, `${t.name} needs a real description`)
    assert.ok(t.parameters, `${t.name} has no parameters schema`)
    assert.equal(typeof t.execute, 'function')
  }
  for (const n of ['signalpipe_record_reply', 'signalpipe_preview_station', 'signalpipe_suggest_anchors',
                   'signalpipe_mark_sent', 'signalpipe_list_stations', 'signalpipe_update_product',
                   'signalpipe_update_station', 'signalpipe_remove_station', 'signalpipe_read_feeds']) {
    assert.ok(names.includes(n), `missing ${n}`)
  }
})

test('score_signal takes context and explains panel_verdict', () => {
  const t = registered().find((x) => x.name === 'signalpipe_score_signal')
  assert.ok(t.parameters.properties.context, 'context parameter missing')
  assert.match(t.description, /panel_verdict/)
})

test('add_station guidance points at /new/.rss and at a preview first', () => {
  const t = registered().find((x) => x.name === 'signalpipe_add_station')
  assert.match(t.description, /\/new\/\.rss/)
  assert.match(t.description, /signalpipe_preview_station/)
  assert.doesNotMatch(t.description, /r\/SUBREDDIT\/\.rss —/)
})

const RSS = `<rss><channel>
<item><title>Need a help desk for 40 agents</title><link>https://forum.example/t/1</link>
<description>our inbox is a mess</description><pubDate>Thu, 25 Sep 2026 09:00:00 +0000</pubDate></item>
<item><title>Tips?</title><link>https://forum.example/t/2</link></item>
</channel></rss>`

test('preview reads the feed on this machine and sends the posts', async () => {
  const sent = []
  const out = await previewFeed('p1', 'https://forum.example/latest.rss', 6, {
    fetchText: async () => RSS,
    preview: async (body) => { sent.push(body); return { verdict: 'VIABLE', judged: 2, kept: 1 } },
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].product_id, 'p1')
  assert.equal(sent[0].sample, 6)
  assert.equal(sent[0].rss_url, undefined, 'the URL is not needed when the posts are sent')
  assert.deepEqual(sent[0].entries.map((e) => e.link), ['https://forum.example/t/1', 'https://forum.example/t/2'])
  assert.equal(out.verdict, 'VIABLE')
  assert.equal(out.fetched_on, 'this machine')
  assert.equal(out.local_fetch_error, undefined)
})

test('when this machine cannot read the feed, the brain is asked to', async () => {
  const sent = []
  const out = await previewFeed('p1', 'https://blocked.example/feed', undefined, {
    fetchText: async () => { throw new Error('feed returned 403') },
    preview: async (body) => { sent.push(body); return { verdict: 'NO DATA' } },
  })
  assert.equal(sent[0].rss_url, 'https://blocked.example/feed')
  assert.equal(sent[0].entries, undefined)
  assert.equal(sent[0].sample, undefined)
  assert.equal(out.fetched_on, 'SignalPipe')
  assert.match(out.local_fetch_error, /403/)
})

test('an empty feed is also handed to the brain, with the reason', async () => {
  const out = await previewFeed('p1', 'https://forum.example/empty.rss', 4, {
    fetchText: async () => '<rss><channel></channel></rss>',
    preview: async (body) => ({ verdict: 'NO DATA', got: body }),
  })
  assert.equal(out.got.rss_url, 'https://forum.example/empty.rss')
  assert.match(out.local_fetch_error, /no posts/)
})
