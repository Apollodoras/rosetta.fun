/**
 * The /account island.
 *
 * The only stateful code on the site. It owns three things and nothing else:
 * the Firebase auth session (in memory — no cookie of ours), a `/v1/me` read,
 * and three write actions the backend authorizes (checkout, portal, delete).
 * Balance is never computed here; it is read. The server is the only authority
 * on identity, quota, balance and entitlement — a §0 invariant.
 */

import { loadConfig } from './config';
import { MoApi, ApiError, type MoMe } from './api';
import { WebAuth, describeAuthError, isPasswordAccount, type User } from './auth';
import { accountName, balanceText, dailyQuotaLine, planLabel, renewalLine } from './format';
import { safeNext } from './navigation';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

function show(el: HTMLElement | null, visible: boolean) {
  if (el) el.hidden = !visible;
}

function notify(el: HTMLElement | null, text: string, kind: 'ok' | 'error' | 'warn' | null = null) {
  if (!el) return;
  el.textContent = text;
  el.className = kind ? `notice notice--${kind}` : 'notice';
  el.hidden = !text;
}

export function start(): void {
  const config = loadConfig();
  if (config.missing.length) return; // the page already renders the loud not-configured card

  const auth = new WebAuth(config);
  const api = new MoApi(config.baseURL, auth.token);

  const loading = $('loading');
  const signedOut = $('signed-out');
  const signedIn = $('signed-in');
  const authMessage = $('auth-message');
  const accountMessage = $('account-message');

  let me: MoMe | null = null;

  // --- Session ------------------------------------------------------------

  // Where to go once they're in. /membership sends a signed-out visitor here to
  // sign in and expects them back (W2/W3).
  const next = safeNext(new URLSearchParams(location.search).get('next'));
  // Only a genuine signed-out → signed-in transition redirects. Arriving here
  // already signed in — a back button, a bookmark — leaves them on the page
  // they actually asked for.
  let sawSignedOut = false;

  auth.onChange(async (user) => {
    show(loading, false);
    show(signedOut, !user);
    show(signedIn, !!user);
    notify(authMessage, '');
    resetDeleteConfirmation();

    if (!user) {
      me = null;
      sawSignedOut = true;
      return;
    }
    if (next && sawSignedOut) return location.replace(next);
    renderIdentity(user);
    await refresh();
  });

  async function refresh() {
    const user = auth.current;
    if (!user) return;
    try {
      me = await api.me();
      render(me, user);
    } catch (error) {
      // A failed read must not look like an empty account — showing "0 songs"
      // when we simply couldn't reach the server would be the same class of lie
      // §0.5 flagged in the app's quota copy.
      notify(accountMessage, describeApiError(error), 'error');
    }
  }

  function renderIdentity(user: User) {
    const emailEl = $('account-email');
    if (emailEl) emailEl.textContent = user.email ?? '';
    // Hidden until `/v1/me` lands and `render` decides whether the heading is
    // going to be a name or this same email (see below).
    show(emailEl, false);
    show($('delete-password-field'), isPasswordAccount(user));
    show($('delete-reauth-note'), !isPasswordAccount(user));
  }

  function render(me: MoMe, user: User) {
    const nameEl = $('account-name');
    if (nameEl) nameEl.textContent = accountName(me, user.email);
    // Most accounts carry no display name, in which case the heading already IS
    // the email address — repeating it underneath reads as a rendering bug.
    show($('account-email'), !!user.email && !!me.displayName?.trim());

    const balanceEl = $('balance');
    if (balanceEl) balanceEl.textContent = balanceText(me);

    const detailEl = $('balance-detail');
    if (detailEl) detailEl.textContent = renewalLine(me);

    const planEl = $('plan-value');
    if (planEl) planEl.textContent = planLabel(me.plan);

    const daily = dailyQuotaLine(me);
    show($('daily-row'), !!daily);
    const dailyEl = $('daily-value');
    if (dailyEl && daily) dailyEl.textContent = daily;

    // The server's opinion is the one that matters (the app reads the same
    // field for the same reason): the SDK's cached `user.emailVerified` can
    // disagree with what the backend will actually allow.
    const unverified = me.emailVerified === false;
    show($('verify-banner'), unverified);
    const verifyEmail = $('verify-email');
    if (verifyEmail) verifyEmail.textContent = user.email ?? 'your inbox';
  }

  // --- Sign in ------------------------------------------------------------

  document.querySelectorAll<HTMLButtonElement>('[data-provider]').forEach((button) => {
    button.addEventListener('click', async () => {
      const method = button.dataset.provider as 'apple' | 'google' | 'twitter' | 'facebook';
      await withBusy(button, async () => {
        try {
          await auth.signInWith(method);
        } catch (error) {
          notify(authMessage, describeAuthError(error), 'error');
        }
      });
    });
  });

  const passwordForm = $<HTMLFormElement>('password-form');
  passwordForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    void passwordAction('sign-in');
  });

  passwordForm?.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    if (button.dataset.action === 'sign-in') return; // handled by submit
    button.addEventListener('click', () => void passwordAction(button.dataset.action as PasswordAction));
  });

  type PasswordAction = 'sign-in' | 'sign-up' | 'reset';

  async function passwordAction(action: PasswordAction) {
    const email = $<HTMLInputElement>('email')?.value.trim() ?? '';
    const password = $<HTMLInputElement>('password')?.value ?? '';

    try {
      if (action === 'reset') {
        if (!email) return notify(authMessage, 'Enter your email first.', 'warn');
        await auth.resetPassword(email);
        // Deliberately does not reveal whether the address has an account —
        // that would be an account-enumeration oracle on a public page.
        return notify(authMessage, 'If that email has an account, a reset link is on its way.', 'ok');
      }
      if (action === 'sign-up') {
        await auth.signUpWithPassword(email, password);
        return notify(authMessage, 'Account created — check your inbox to confirm your email.', 'ok');
      }
      await auth.signInWithPassword(email, password);
    } catch (error) {
      notify(authMessage, describeAuthError(error), 'error');
    }
  }

  $('sign-out')?.addEventListener('click', () => void auth.signOut());

  // --- Email verification -------------------------------------------------

  $('resend-verification')?.addEventListener('click', async (event) => {
    await withBusy(event.currentTarget as HTMLButtonElement, async () => {
      try {
        await auth.resendVerification();
        notify(accountMessage, 'Sent — check your inbox.', 'ok');
      } catch (error) {
        notify(accountMessage, describeAuthError(error), 'error');
      }
    });
  });

  $('recheck-verification')?.addEventListener('click', async (event) => {
    await withBusy(event.currentTarget as HTMLButtonElement, async () => {
      // Reload the Firebase user first: its verified claim is baked into the ID
      // token, so without this the next `/v1/me` would send a stale token and
      // the banner would refuse to go away after a successful confirmation.
      await auth.current?.reload();
      await refresh();
      if (me?.emailVerified === false) {
        notify(accountMessage, "Not confirmed yet — open the link in the email we sent you.", 'warn');
      } else {
        notify(accountMessage, 'Thanks — your email is confirmed.', 'ok');
      }
    });
  });

  // --- Buying -------------------------------------------------------------

  document.querySelectorAll<HTMLButtonElement>('[data-price]').forEach((button) => {
    button.addEventListener('click', async () => {
      const priceID = button.dataset.price!;
      await withBusy(button, async () => {
        try {
          // The site never talks to Stripe directly and holds no Stripe key:
          // the backend mints the session against the caller's own uid, so the
          // browser cannot buy on someone else's behalf or invent a price.
          const url = await api.checkoutURL(
            priceID,
            `${location.origin}/account?checkout=success`,
            `${location.origin}/account?checkout=cancelled`,
          );
          location.assign(url);
        } catch (error) {
          notify(accountMessage, describeApiError(error), 'error');
        }
      });
    });
  });

  $('portal')?.addEventListener('click', async (event) => {
    await withBusy(event.currentTarget as HTMLButtonElement, async () => {
      try {
        const url = await api.portalURL(`${location.origin}/account`);
        location.assign(url);
      } catch (error) {
        // "No billing history yet — nothing to manage." is the expected answer
        // for anyone who has never bought anything, which is most people. It is
        // information, not a fault, so it doesn't get the red alarm treatment.
        const informational = error instanceof ApiError && error.status === 404;
        notify(accountMessage, describeApiError(error), informational ? null : 'error');
      }
    });
  });

  // --- Deletion (parity with the app's A3 flow) ---------------------------

  function resetDeleteConfirmation() {
    show($('delete-confirm-row'), false);
    show($('delete-start'), true);
  }

  $('delete-start')?.addEventListener('click', () => {
    // Double-confirm, same as the app: the first press only reveals the second.
    show($('delete-start'), false);
    show($('delete-confirm-row'), true);
    notify(accountMessage, 'This cannot be undone. Confirm to delete your account for good.', 'warn');
  });

  $('delete-cancel')?.addEventListener('click', () => {
    resetDeleteConfirmation();
    notify(accountMessage, '');
  });

  $('delete-confirm')?.addEventListener('click', async (event) => {
    await withBusy(event.currentTarget as HTMLButtonElement, async () => {
      const user = auth.current;
      if (!user) return;
      const password = $<HTMLInputElement>('delete-password')?.value || undefined;

      try {
        // Firebase requires a recent login before deletion, and the reauth must
        // come first: it can fail (wrong password, cancelled popup), and failing
        // *after* the server wipe would leave an account with no data.
        await auth.reauthenticate(password);
      } catch (error) {
        return notify(accountMessage, describeAuthError(error), 'error');
      }

      try {
        // Server data first, while a token still exists to authorize it — the
        // same ordering the app uses (A3). Both halves are idempotent, so a
        // failure between them is resumable by signing in and repeating.
        await api.deleteServerData();
      } catch (error) {
        return notify(accountMessage, describeApiError(error), 'error');
      }

      try {
        await auth.deleteIdentity();
      } catch (error) {
        return notify(
          accountMessage,
          'Your Rosetta data is deleted, but the sign-in itself could not be removed. Sign in again and retry to finish.',
          'error',
        );
      }
      // onChange fires and swaps back to the signed-out view.
      notify(authMessage, 'Your account has been deleted.', 'ok');
    });
  });

  // --- Returning from Stripe ---------------------------------------------

  const checkout = new URLSearchParams(location.search).get('checkout');
  if (checkout === 'success') {
    // The balance moves on the *webhook*, not on this redirect — the redirect is
    // only the player's browser coming back and can arrive first. So this says
    // "on its way" rather than asserting a number, and re-reads shortly after.
    notify(accountMessage, 'Thanks! Your purchase is being confirmed — your balance updates in a moment.', 'ok');
    setTimeout(() => void refresh(), 2500);
  } else if (checkout === 'cancelled') {
    notify(accountMessage, 'Checkout cancelled — nothing was charged.', null);
  }
  if (checkout) history.replaceState({}, '', '/account');
}

function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Try again shortly.';
}

async function withBusy(button: HTMLButtonElement | null, work: () => Promise<void>) {
  if (!button) return work();
  const label = button.textContent;
  button.disabled = true;
  try {
    await work();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
