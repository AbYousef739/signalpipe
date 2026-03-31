import { registerMantidaeTools } from './tools/mantidae'
import { registerCompanionTools } from './tools/companion'

/**
 * SignalPipe — OpenClaw Plugin
 *
 * Registers two tool sets:
 *   signalpipe_*  — Mantidae acquisition tools (top-of-funnel)
 *   signalpipe_*  — Companion nurturing tools (mid/bottom-of-funnel)
 *
 * Required environment variables (set before starting OpenClaw gateway):
 *   SIGNALPIPE_API_URL       https://your-railway-url.up.railway.app
 *   SIGNALPIPE_OPERATOR_KEY  your-secret-operator-key
 */
export default function register(api: any): void {
  registerMantidaeTools(api)
  registerCompanionTools(api)

  console.log('[SignalPipe] Plugin loaded — 10 tools registered')
}
