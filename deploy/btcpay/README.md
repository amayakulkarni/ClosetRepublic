# BTCPay Server for Closet Republic

Self-hosted crypto checkout at `https://pay.closetrepublic.com`, behind the server's existing nginx.
Bitcoin (pruned node) and Monero. Lightning is a later phase. Strategy: https://claude.ai/code/artifact/ab89cc0d-a8db-4f4a-b048-b02a7b39325c

| File | Purpose |
| --- | --- |
| `compose.yml` | BTCPay Server, Postgres, NBXplorer, bitcoind, monerod and the Monero wallet RPC. Publishes only `127.0.0.1:40009`. |
| `pay.closetrepublic.com.conf` | nginx site: HTTPS, forwarded headers, websockets, no access log. |

## Requirements

- Docker Engine with the Compose plugin (`docker compose version`).
- About 250 GB free SSD (Monero pruned is about 105 GB, Bitcoin pruned about 25 GB plus chainstate, and growth headroom), 4 GB RAM, 2 or more CPU cores.
- A DNS `A` (and `AAAA` if used) record for `pay.closetrepublic.com` pointing at the server.
- Ports 40001 to 40008 are already in use by the site, forum, bridge and bot; 40009 is BTCPay's.

## Setup

1. Copy this folder to the server, for example `/opt/closet-republic/btcpay`.
2. Start the stack:
   ```
   cd /opt/closet-republic/btcpay
   docker compose up -d
   docker compose ps
   ```
3. Get the certificate and enable the nginx site (commands are at the top of `pay.closetrepublic.com.conf`).
4. Open `https://pay.closetrepublic.com` straight away and register. **The first account becomes the server admin.** Then turn off public registration: Server Settings > Policies > "Disable new user registration".
5. Wait for sync. The Bitcoin and Monero nodes download their chains first; this can take one to several days. Progress shows on the BTCPay dashboard and in `docker compose logs -f bitcoind monerod`.
6. Create a store named Closet Republic, default currency USD.
7. Bitcoin wallet: Store > Wallets > Bitcoin > "Connect an existing wallet" with an extended public key (xpub/zpub) from a hardware or desktop wallet. Keep the seed off the server.
8. Monero:
   - Server Settings > Plugins > install **Monero**, then restart BTCPay (`docker compose restart btcpayserver`).
   - Create a dedicated Monero wallet on a separate device. In Store > Monero settings enter its primary address, private **view** key and restore height. The server can watch payments but never spend.
9. Checkout privacy: Store > Checkout Appearance. Turn off requests for buyer email and name, and turn off emailed receipts.
10. Connect the site (the site README section "Crypto memberships" has the details):
    - Create an API key limited to the store with "Can create invoice" and "Can view invoices".
    - Create a webhook with Payload URL `https://closetrepublic.com/api/webhooks/btcpay`, the events "An invoice has been settled" and "A payment has been settled", and a secret.
    - Set `BTCPAY_URL=http://127.0.0.1:40009`, `BTCPAY_STORE_ID`, `BTCPAY_API_KEY` and `BTCPAY_WEBHOOK_SECRET` in the site's `.env.local`, then `npm run build` and `pm2 restart closet-republic`.
    - Test with a small payment on testnet, or a real $1 Alien membership paid in Lightning or Monero.

## Operations

| Task | Command |
| --- | --- |
| Status | `docker compose ps` |
| Logs | `docker compose logs -f btcpayserver` |
| Restart | `docker compose restart btcpayserver` |
| Update | Change the image tags in `compose.yml` to the versions in [btcpayserver-docker](https://github.com/btcpayserver/btcpayserver-docker/tree/master/docker-compose-generator/docker-fragments), then `docker compose pull && docker compose up -d` |
| Stop | `docker compose down` (volumes and data stay) |

## Backups

Back up these Docker volumes regularly and before every update:

- `btcpay_postgres_datadir`: stores, invoices, users and settings.
- `btcpay_xmr_wallet`: the Monero view-only wallet files.
- `btcpay_btcpay_datadir` and `btcpay_btcpay_pluginsdir`.

The blockchain volumes (`btcpay_bitcoin_datadir`, `btcpay_xmr_data`) can be re-downloaded and need no backup. Example:

```
docker run --rm -v btcpay_postgres_datadir:/v -v "$PWD":/b alpine tar czf /b/btcpay-postgres-$(date +%F).tgz -C /v .
```

## Security notes

- Port 40009 is bound to `127.0.0.1` only. BTCPay trusts `X-Forwarded-*` headers from any client, so the port must never be exposed directly.
- Postgres and the node RPC ports are reachable only on the compose network.
- Archive settled invoices monthly (Invoices > Archive) so old order tokens are not kept, as the Privacy Policy will promise.
- Accepting crypto has tax consequences in India (30% on VDA income); see the strategy doc before going live.
