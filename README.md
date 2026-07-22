# rosetta.fun

**Accounts and membership. That is the whole site.**

Scope of record: `ROSETTA_FUN_HANDOFF.md` (in the `MIDI_Tab_Game` repo). Where it
disagrees with `ROSETTA_FUN.md` — the full marketing plan — the handoff wins for
what ships now, and `ROSETTA_FUN.md` describes what is deferred.

A visitor can create an account or sign in, see which membership they're on, and
choose or change one. Nothing else.

| Route | |
|---|---|
| `/` | Landing shell: wordmark, one line, **Sign in** / **Membership**, legal footer. |
| `/account` | Sign in · create account · reset password · plan and songs remaining · manage billing · sign out · delete account. |
| `/membership` | The plan chooser: Free vs Rosetta Plus, current plan marked, checkout or Stripe portal. |
| `/legal/{terms,privacy,refunds}` | Required by Stripe and by App Store review. **Drafts — owner approval pending.** |
| `/.well-known/apple-app-site-association` | Pairs with the app's Associated Domains entitlement. |

What is deliberately **not** here: the marketing home, `/app`, `/mo`,
`/hardware`, `/support`, FAQ, email capture, analytics, blog, and credit packs.
Do not add them back without the owner saying so.

**The marketing home is not lost.** It survives, complete and unrouted, in
`src/home-body.html` — the "SKIN · GLASS · MIND · WOOD" page from
`ROSETTA_FUN.md` §3.1, a self-contained fragment with its own style and script.
Restoring it is a document shell around `import body from '../home-body.html?raw'`.
`src/pages/index.astro` says so too, so nobody "fixes" the missing home page by
writing a new one.

## The one architectural decision

**All billing logic is in `mo-backend`, not here.** The site is static. The
account page is a client-side island that signs in with the Firebase Web SDK and
calls the *same* API the iOS app calls, with the *same* kind of bearer token, and
resolves to the *same* uid. There is no server of ours in between, no session
cookie of ours, and no Stripe secret on this side — checkout and portal sessions
are minted by the backend against the caller's own token. A second billing
implementation is exactly how idempotency gets got wrong twice.

## Running it

```sh
npm install
cp .env.example .env      # then fill in — see the comments in that file
npm run dev               # http://localhost:4321
npm test                  # pure copy/format helpers (node:test)
npm run check             # astro + TypeScript diagnostics
npm run build             # static output in dist/
```

`npm test` covers the pure helpers only — the copy decisions in `lib/format.ts`
and the `?next=` open-redirect guard in `lib/navigation.ts`. The DOM wiring is
verified by driving a real browser, because that is where it actually breaks.

This repo is standalone. `mo-backend` and the iOS app live in the `MIDI_Tab_Game`
repo alongside their handoff docs; nothing here imports from them, and the only
thing shared is the Firebase project and the design tokens
(`src/styles/tokens.css`, mirrored by hand from the app's `AppTheme.swift` —
keep them in step).

To drive `/account` against a **local backend**, set
`PUBLIC_MO_BASE_URL=http://127.0.0.1:8000` in `.env` and run, from `mo-backend/`:

```sh
FIREBASE_PROJECT_ID=mo-rosetta \
GOOGLE_APPLICATION_CREDENTIALS=../security/<service-account>.json \
MO_REQUIRE_AUTH=1 \
MO_CORS_ORIGINS=http://localhost:4321 \
python -m uvicorn app.main:app --port 8000
```

Two gotchas that cost time once already:

- **The service-account credential is not optional locally.** `app/auth.py`'s
  docstring says a project id alone is enough to verify ID tokens; in practice
  `firebase_admin` raises `DefaultCredentialsError` without one, and every real
  token comes back 401. Production is unaffected (it has the key in
  `mo-secrets`).
- **`MO_CORS_ORIGINS` must match the page's origin exactly**, scheme and port
  included — `http://localhost:4321`, not `127.0.0.1`. A mismatch surfaces in the
  browser as an indistinguishable network failure.

## Deploying (owner steps)

Nothing goes to the production domain without the owner seeing a preview first.

1. **Host:** Vercel or Cloudflare Pages, build `npm run build`, output `dist`.
   Header rules for both are checked in (`vercel.json`, `public/_headers`); the
   platform that doesn't read one ignores it.
2. **Env vars** on the host: everything in `.env.example`.
3. **Firebase console → Authentication → Settings → Authorized domains:** add the
   production domain *and* the preview domain. Missing this is the single most
   likely first-deploy failure — the page reports it by name if it happens.
4. **Firebase console → Project settings → Your apps → Add app → Web:** gives the
   `PUBLIC_FIREBASE_APP_ID`. Auth works without it; register it anyway so the
   value is real rather than absent.
5. **Backend:** set `MO_CORS_ORIGINS` in the Modal secret `mo-secrets` to the
   production origin (comma-separate the preview origin if you want the preview
   to talk to production data — usually you don't).
6. **AASA:** confirm `https<host>/.well-known/apple-app-site-association` returns
   `200` with `Content-Type: application/json` and **no redirect**. A static host
   will otherwise serve it as `text/plain` and shared-credential AutoFill fails
   silently.
7. **Password-reset action URL** (Firebase console → Authentication → Templates):
   point it at the site's domain for branded emails.
8. **Prices:** leave `PUBLIC_STRIPE_PRICES=[]` until the owner signs off on
   numbers (decision D3). Empty renders "coming soon" everywhere; the checkout
   code path is complete and waiting. Every id put in it must also exist in the
   backend's `MO_STRIPE_PRICES` map or checkout answers 400.

> ⚠️ **`rosetta.fun` already resolves to something else.** This repo's `gh-pages`
> branch serves an older, unrelated Rosetta site (a manifesto page plus a MIDI
> search prototype) via GitHub Pages, with a `CNAME` claiming the apex domain.
> That deployment is untouched by this project and is still live. Pointing the
> domain at this site means retiring or redirecting that one first — an owner
> decision, not a build step. (`ROSETTA_FUN_HANDOFF.md` §9 B7 calls the domain
> unprovisioned; that line is stale.)

## What is verified, and what is not

Verified in a real browser against a dev build:

- All four `/membership` states render — signed-out with an empty catalog (the
  state the site ships in), signed-out with a price, and the signed-in Free and
  Plus shapes.
- `/` makes no third-party request and names no product feature; the built HTML
  references no external asset host at all.
- Only the six intended routes build. `/pricing` is gone.
- 375 px viewport stacks with no horizontal overflow; dark-only throughout.
- The `?next=` hand-off carries `/account?next=/membership`, and its guard is
  unit-tested against open-redirect payloads.

**Not verified, and honestly cannot be here:**

- **Any signed-in path against a real session.** Signing in needs the owner's own
  credentials. The signed-in states above were confirmed by applying the exact
  DOM changes the island makes — the markup and CSS are right; the
  `onAuthStateChanged → renderPlan` wiring is reviewed code that has never run
  against a live session.
- **The entire Stripe loop** (handoff W5): checkout, webhook, ledger, renewal via
  a test clock, cancellation via the portal. No real Stripe account has ever been
  touched (blocker B2). Budget real time for it and expect surprises.
- **Deployment** (W6), and everything in handoff §9 that is owner-side: the price
  itself (B1), Postgres for the ledger (B3), rate limits (B4), legal approval
  (B5).

## Fonts

`Sora` (display) + `Inter` (UI) are specified in `tokens.css` but no woff2 files
are checked in yet, so both fall back to the system UI face. They are
deliberately **not** loaded from Google Fonts: the site makes no third-party
requests, which is what lets it skip a cookie banner entirely. Drop self-hosted
woff2 into `public/fonts/` and add `@font-face` to finish it.
