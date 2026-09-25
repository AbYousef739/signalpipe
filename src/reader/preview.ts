/**
 * Station preview: check a feed for buyers BEFORE adding it.
 *
 * The feed is fetched on this machine (the same way the reader fetches
 * client-side stations), parsed with the built-in parser, and the posts are
 * sent to POST /stations/preview, where the brain scores them and has its
 * panel judge the best-matching ones. Nothing is saved on either side.
 *
 * If this machine cannot read the feed (offline, blocked, not a feed), the
 * URL is passed to the brain instead, which fetches it itself and explains a
 * refusal (for example a feed that only this machine may read).
 */
import { api, PREVIEW_TIMEOUT_MS } from '../api/client'
import { parseFeed, FeedEntry } from './feed'
import { fetchFeedText } from './manager'

const MAX_ENTRIES = 50

export interface PreviewDeps {
  fetchText: (url: string) => Promise<string>
  preview: (body: Record<string, unknown>) => Promise<any>
}

export const defaultPreviewDeps: PreviewDeps = {
  fetchText: fetchFeedText,
  preview: (body) => api.post('/stations/preview', body, { timeoutMs: PREVIEW_TIMEOUT_MS }),
}

export async function previewFeed(
  productId: string, rssUrl: string, sample?: number, deps: PreviewDeps = defaultPreviewDeps,
): Promise<any> {
  let entries: FeedEntry[] = []
  let localError: string | null = null
  try {
    entries = parseFeed(await deps.fetchText(rssUrl), MAX_ENTRIES)
    if (!entries.length) localError = 'the feed returned no posts'
  } catch (e) {
    localError = e instanceof Error ? e.message : String(e)
  }
  const body: Record<string, unknown> = { product_id: productId }
  if (sample) body.sample = sample
  if (entries.length) body.entries = entries
  else body.rss_url = rssUrl
  const result = await deps.preview(body)
  return {
    ...result,
    fetched_on: entries.length ? 'this machine' : 'SignalPipe',
    ...(localError && !entries.length ? { local_fetch_error: localError } : {}),
  }
}
