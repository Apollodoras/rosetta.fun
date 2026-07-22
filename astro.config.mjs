// @ts-check
import { defineConfig } from 'astro/config';

// Static output on purpose (ROSETTA_FUN §7): the only server-side needs —
// checkout sessions, webhooks, entitlement reads — all live in `mo-backend`,
// which already owns the user table, token verification and the ledger. A
// second runtime would mean two billing implementations and two places to get
// idempotency wrong. The account page is a client-side island talking to the
// same API the iOS app talks to.
export default defineConfig({
  site: 'https://rosetta.fun',
  output: 'static',
  build: {
    // `/account` not `/account/index.html` — keeps the URL the AASA file and
    // the Firebase action links point at stable.
    format: 'file',
  },
});
