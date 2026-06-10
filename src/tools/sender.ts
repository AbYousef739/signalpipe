import { Type } from '@sinclair/typebox'
import { api } from '../api/client'
import { senderManager } from '../sender/manager'

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function err(e: unknown): ToolResult {
  return { content: [{ type: 'text', text: String(e) }], isError: true }
}

/**
 * Sender tools — the user-side "send" half of SignalPipe v4.
 *
 * The brain scores, drafts, and approves missions; these tools run the local
 * loop that streams approved missions and posts them on Reddit with the
 * operator's OWN credentials. They contain no scoring, drafting, or storage —
 * they only send. Platform credentials are read from the environment and never
 * leave the machine.
 */
export function registerSenderTools(openClaw: any): void {

  openClaw.registerTool({
    name: 'signalpipe_start_sender',
    description:
      'Start the background Reddit sender. It opens a live stream to your ' +
      'SignalPipe brain, receives missions the brain has already scored, ' +
      'drafted, and approved, and posts them on Reddit using YOUR OWN ' +
      'credentials (reddit_comment and reddit_dm channels). It never scores ' +
      'or drafts anything — it only sends. ' +
      'Requires REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, and ' +
      'REDDIT_PASSWORD in the environment (a Reddit "script" app on the ' +
      'sending account); these stay on this machine and are never sent to ' +
      'SignalPipe. twitter_reply missions are left for the standalone ' +
      'signalpipe-daemon and skipped here. The sender keeps running in the ' +
      'background until you call signalpipe_stop_sender or the gateway ' +
      'restarts. Daily caps pace sending; a capped mission is skipped (stays ' +
      'queued), not failed. Use dry_run to verify wiring without posting. ' +
      'Confirm with the user before starting a live (non-dry-run) sender.',
    parameters: Type.Object({
      dry_run: Type.Optional(Type.Boolean({
        description:
          'Log intended sends without posting to Reddit or acking the brain. ' +
          'Use this first to confirm the stream connects and missions arrive. Default false.',
      })),
    }),
    async execute(_id: string, params: { dry_run?: boolean } = {}) {
      try {
        return ok(senderManager.start(Boolean(params.dry_run)))
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_stop_sender',
    description:
      'Stop the background Reddit sender started by signalpipe_start_sender. ' +
      'Closes the mission stream cleanly. Missions already posted are ' +
      'unaffected; any unsent approved missions stay queued on the brain and ' +
      'will be delivered next time the sender runs. ' +
      'Within a running session the sender never posts the same mission ' +
      'twice, so stopping and restarting is always safe.',
    parameters: Type.Object({}),
    async execute(_id: string) {
      try {
        return ok(senderManager.stop())
      } catch (e) { return err(e) }
    },
  })

  openClaw.registerTool({
    name: 'signalpipe_sender_status',
    description:
      'Report the Reddit sender state: whether the background loop is ' +
      'running, whether it is connected or paused, and how many missions it ' +
      'has sent / failed / skipped this session — plus the brain-side view ' +
      '(queue depth, auto-fire threshold, version). ' +
      'Presentation: summarise the local loop state first (running? ' +
      'connected? counts), then the brain queue depth. Call this to check on ' +
      'the sender or confirm it is connected after starting it.',
    parameters: Type.Object({}),
    async execute(_id: string) {
      const local = senderManager.status()
      try {
        const brain = await api.get('/v4/sender/status')
        return ok({ local, brain })
      } catch (e) {
        // Brain status is best-effort; the local loop view is still useful
        // even if the brain is briefly unreachable.
        return ok({ local, brain_error: String(e) })
      }
    },
  })
}
