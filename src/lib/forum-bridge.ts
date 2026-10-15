import 'server-only';
import crypto from 'node:crypto';

// Sends a verified Buy Me a Coffee event on to the forum bridge (cr-bridge), signed with the
// shared secret, so membership changes update forum ranks. Never blocks or fails the webhook.
//   FORUM_BRIDGE_URL     http://127.0.0.1:40007 when the forum is on the same server,
//                        https://forum.closetrepublic.com/bridge otherwise
//   FORUM_BRIDGE_SECRET  the same value as CR_BRIDGE_SECRET in /etc/closet-republic/bridge.env
export function forwardToForumBridge(raw: string) {
  const base = process.env.FORUM_BRIDGE_URL;
  const secret = process.env.FORUM_BRIDGE_SECRET;
  if (!base || !secret) return;
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  fetch(`${base.replace(/\/$/, '')}/webhooks/bmc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cr-signature': signature },
    body: raw,
    signal: AbortSignal.timeout(5000),
  }).catch((err) => console.warn('[forum-bridge] not forwarded:', err.message));
}
