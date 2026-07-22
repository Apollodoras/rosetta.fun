/**
 * Post-sign-in redirect targets.
 *
 * `/membership` sends a signed-out visitor to `/account?next=/membership` and
 * expects them back. That parameter is attacker-controllable — it arrives in a
 * URL anyone can compose and mail around — so it is validated rather than
 * trusted: an unchecked `next` is a textbook open redirect, and a sign-in page
 * that bounces to someone else's lookalike domain right after the player types
 * their password is about the worst place to have one.
 *
 * Pure and in its own module so it can be unit-tested without importing the DOM
 * or the Firebase SDK.
 */

/** Routes a `?next=` is allowed to name. An allow-list rather than a pattern:
 *  this site has five routes, so enumerating them is both possible and the
 *  strongest available check. */
const ALLOWED = new Set(['/membership', '/account', '/']);

/**
 * @returns the path to redirect to, or `null` to stay put.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Anything with a scheme or an authority is rejected outright, before any
  // normalizing: `https://evil.example`, `//evil.example` (protocol-relative,
  // the one people forget), and `\\evil.example` (which some browsers treat as
  // `//`). Only a same-origin absolute path survives.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (raw.includes('\\')) return null;

  // Compare on the path alone; a query or fragment is dropped rather than
  // carried, since no destination here needs one.
  const path = raw.split(/[?#]/)[0].replace(/\.html$/, '');
  return ALLOWED.has(path) ? path : null;
}
