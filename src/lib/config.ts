/**
 * Build-time public configuration, validated once.
 *
 * The invariant carried over from the backend (ROSETTA_ACCOUNTS.md §0): an
 * unconfigured deployment fails closed, but *loudly and observably*. A missing
 * Firebase key must not produce a sign-in button that silently does nothing —
 * `/account` renders an explicit "not configured" card naming the missing keys.
 */

export type AuthMethod = 'apple' | 'google' | 'twitter' | 'facebook' | 'password';

const ALL_METHODS: AuthMethod[] = ['apple', 'google', 'twitter', 'facebook', 'password'];

export interface PriceOption {
  id: string;
  label: string;
  blurb?: string;
  price?: string;
}

export interface SiteConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  };
  baseURL: string;
  methods: AuthMethod[];
  prices: PriceOption[];
  /** Names of the required env vars that came back empty. */
  missing: string[];
}

function env(key: string): string {
  // Astro inlines PUBLIC_* at build time; the indexed read keeps this honest
  // when a key is absent rather than throwing on the property access.
  return ((import.meta.env as Record<string, unknown>)[key] as string | undefined)?.trim() ?? '';
}

function parseMethods(raw: string): AuthMethod[] {
  if (!raw) return ALL_METHODS;
  const asked = raw
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  // Unknown names are dropped rather than thrown: a typo in one provider must
  // not take the whole sign-in page down. Order follows the env so the owner
  // controls prominence (App Store review checks SIWA prominence — A9).
  const known = asked.filter((m): m is AuthMethod => (ALL_METHODS as string[]).includes(m));
  return known.length ? known : ALL_METHODS;
}

function parsePrices(raw: string): PriceOption[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is PriceOption => !!p && typeof p.id === 'string' && typeof p.label === 'string');
  } catch {
    // Deliberately empty rather than a crash: a malformed catalog degrades to
    // "purchases coming soon", which is the D3 default state anyway.
    console.warn('PUBLIC_STRIPE_PRICES is not valid JSON — no purchase options will be shown.');
    return [];
  }
}

export function loadConfig(): SiteConfig {
  const firebase = {
    apiKey: env('PUBLIC_FIREBASE_API_KEY'),
    authDomain: env('PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: env('PUBLIC_FIREBASE_PROJECT_ID'),
    appId: env('PUBLIC_FIREBASE_APP_ID'),
  };

  // `appId` is deliberately NOT required: Firebase Auth doesn't use it (it
  // identifies the app to Analytics/Installations, which this site doesn't
  // load). Requiring it would fail sign-in closed over a value sign-in never
  // reads — and would make a local run against the real project impossible
  // without registering a web app first. It is still carried when present so
  // adding Analytics later needs no config change.
  const required: Record<string, string> = {
    PUBLIC_FIREBASE_API_KEY: firebase.apiKey,
    PUBLIC_FIREBASE_AUTH_DOMAIN: firebase.authDomain,
    PUBLIC_FIREBASE_PROJECT_ID: firebase.projectId,
    PUBLIC_MO_BASE_URL: env('PUBLIC_MO_BASE_URL'),
  };

  return {
    firebase,
    baseURL: env('PUBLIC_MO_BASE_URL').replace(/\/+$/, ''),
    methods: parseMethods(env('PUBLIC_AUTH_METHODS')),
    prices: parsePrices(env('PUBLIC_STRIPE_PRICES')),
    missing: Object.entries(required)
      .filter(([, value]) => !value)
      .map(([key]) => key),
  };
}

/**
 * The monthly song allowances, mirrored from the backend.
 *
 * Source of truth: `mo-backend/app/billing/entitlement.py`
 * (`FREE_ALLOWANCE_PER_MONTH` / `PLUS_ALLOWANCE_PER_MONTH`). They live here as
 * named constants — and nowhere else — so `/membership` never hardcodes a
 * number inline and a backend change is one edit on this side rather than a
 * hunt through markup. If they change there, change them here in the same
 * session: a plan page that overstates the allowance is a refund request.
 *
 * The *price* is deliberately not here. It comes from `PUBLIC_STRIPE_PRICES`,
 * because it is the one number the owner has not signed off (decision D3).
 */
export const ALLOWANCE = {
  free: 3,
  plus: 30,
} as const;

/** The plan a price id sells. Only Plus is offered on the web today; credit
 *  packs exist in the backend's map but are out of scope (HANDOFF §1), so the
 *  catalog is read as "the Plus membership" and nothing else. */
export function plusPrice(prices: PriceOption[]): PriceOption | null {
  return prices[0] ?? null;
}

export const METHOD_LABELS: Record<AuthMethod, string> = {
  apple: 'Continue with Apple',
  google: 'Continue with Google',
  twitter: 'Continue with X',
  facebook: 'Continue with Facebook',
  password: 'Email and password',
};
