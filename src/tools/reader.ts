import { Type } from '@sinclair/typebox'
import { readerManager } from '../reader/manager'
import { previewFeed } from '../reader/preview'

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(e: unknown): ToolResult {
  return { content: [{ type: 'text', text: String(e) }], isError: true }
}

/**
 * Reader tool — client-side reading. Fetches the feeds the brain marks
 * read_by: "client" from THIS machine and hands each page to the brain for
 * judging. No scoring happens here, and no credentials are involved: it only
 * reads public feeds and forwards the posts.
 */
export function registerReaderTools(openClaw: any): void {

  openClaw.registerTool({
    name: 'signalpipe_read_feeds',
    description:
      'Read the stations your SignalPipe brain marks for this machine ' +
      '(read_by: "client" in /stations/list) and send each feed page to the ' +
      'brain for judging. The feeds are fetched from this machine, at most 50 ' +
      'posts per feed and a minute between feeds (Reddit limits how fast one ' +
      'machine may read); the brain then scores the posts exactly as if its own ' +
      'scout had read them, and any missions reach your queue as usual. With no ' +
      'parameters it starts one pass in the background and returns at once; call ' +
      'it again for the last pass\'s counts. Pass every_minutes (10 or more) to keep reading in the ' +
      'background on that interval, or stop: true to end the background reader. ' +
      'Call it with no parameters first to see which feeds are marked for this ' +
      'machine. A feed the brain judged a few minutes ago is skipped (cooldown), ' +
      'which is normal.',
    parameters: Type.Object({
      every_minutes: Type.Optional(Type.Integer({
        minimum: 10,
        description: 'Keep reading in the background every N minutes (minimum 10; the scout itself runs every 30).',
      })),
      stop: Type.Optional(Type.Boolean({
        description: 'Stop the background reader.',
      })),
    }),
    async execute(_id: string, params: { every_minutes?: number; stop?: boolean } = {}) {
      try {
        if (params.stop) return ok({ ...readerManager.stop(), ...readerManager.status() })
        if (params.every_minutes) return ok({ ...readerManager.start(params.every_minutes), ...readerManager.status() })
        return ok({ ...readerManager.startPass(), ...readerManager.status() })
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_preview_station',
    description:
      'Check whether a feed has buyers for a product BEFORE adding it as a station. Which ' +
      'communities you listen to decides results more than any setting, and a feed full of ' +
      'people talking about your topic can still contain no one asking to buy. The feed is ' +
      'read on this machine, then the brain scores its fresh posts and the three judges read ' +
      'the best-matching ones (default 8, one judgement each). Nothing is saved. ' +
      'Returns a verdict fixed by pre-set thresholds: VIABLE (worth adding), MARGINAL (a ' +
      'trickle), ON-TOPIC, NOT IN-MARKET (topic talk, no buyers: try a different community), ' +
      'NO BUYERS, or NO DATA (nothing could be judged; the explanation says why, such as an empty ' +
      'or stale feed or keywords that blocked every post), with a sample of judged posts. ' +
      'Presentation: lead with the verdict and its one-line explanation, then how many judged ' +
      'posts were kept. Suggest signalpipe_add_station only for VIABLE or MARGINAL.',
    parameters: Type.Object({
      product_id: Type.String({ description: 'Product to judge the feed against (from signalpipe_get_products)' }),
      rss_url:    Type.String({ description: 'The feed to check, e.g. https://www.reddit.com/r/SUBREDDIT/new/.rss' }),
      sample:     Type.Optional(Type.Integer({ minimum: 1, maximum: 12, description: 'Posts for the judges (default 8)' })),
    }),
    async execute(_id: string, params: { product_id: string; rss_url: string; sample?: number }) {
      try {
        return ok(await previewFeed(params.product_id, params.rss_url, params.sample))
      } catch (e) { return err(e) }
    },
  })
}
