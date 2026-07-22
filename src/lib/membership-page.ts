/**
 * The /membership island.
 *
 * Same shape as `account-page.ts` and the same two dependencies — `WebAuth` for
 * identity and `MoApi` for everything else. There is deliberately no second API
 * client and no Stripe SDK here: checkout and portal sessions are minted by
 * mo-backend against the caller's own token, so this file cannot invent a price
 * or buy on another uid's behalf even if it wanted to.
 *
 * It reads `plan`; it never writes it. The plan moves on a verified Stripe
 * webhook and nowhere else — not on a redirect, not on a click.
 */

import { loadConfig } from './config';
import { MoApi, ApiError } from './api';
import { WebAuth } from './auth';

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
  const message = $('membership-message');

  auth.onChange(async (user) => {
    if (!user) return renderSignedOut();
    // Optimistically the signed-in-free shape, then corrected by /v1/me. The
    // wrong CTA for a moment beats a page that sits blank while a request flies.
    renderPlan('free');
    try {
      const me = await api.me();
      renderPlan(me.plan === 'plus' ? 'plus' : 'free');
    } catch (error) {
      // Falling back to "free" here would invite a Plus subscriber to buy a
      // second subscription. Unknown is its own state: no purchase CTA, and the
      // portal stays reachable so an existing subscriber can still manage.
      renderPlan(null);
      notify(message, describeApiError(error), 'error');
    }
  });

  function renderSignedOut() {
    show($('free-current'), false);
    show($('plus-current'), false);
    show($('plus-signin'), true);
    show($('plus-checkout-row'), false);
    show($('plus-portal-row'), false);
    notify(message, '');
  }

  /** `null` = signed in, but the plan couldn't be read. */
  function renderPlan(plan: 'free' | 'plus' | null) {
    show($('plus-signin'), false);
    show($('free-current'), plan === 'free');
    show($('plus-current'), plan === 'plus');
    // Only a known-free account is offered the purchase. A Plus account gets the
    // portal instead — Stripe owns cancel, resume, cards and invoices.
    show($('plus-checkout-row'), plan === 'free' && !!$('plus-checkout'));
    show($('plus-portal-row'), plan !== 'free');
  }

  $('plus-checkout')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    await withBusy(button, async () => {
      try {
        const url = await api.checkoutURL(
          button.dataset.price!,
          // Back to /account, which owns the "being confirmed" copy: the
          // redirect only proves Stripe finished. The webhook moves the plan,
          // milliseconds to seconds later, and that page already re-reads.
          `${location.origin}/account?checkout=success`,
          `${location.origin}/membership?checkout=cancelled`,
        );
        location.assign(url);
      } catch (error) {
        notify(message, describeApiError(error), 'error');
      }
    });
  });

  $('plus-portal')?.addEventListener('click', async (event) => {
    await withBusy(event.currentTarget as HTMLButtonElement, async () => {
      try {
        const url = await api.portalURL(`${location.origin}/membership`);
        location.assign(url);
      } catch (error) {
        // 404 means this uid has never had billing history — the expected answer
        // for most people, and information rather than a fault.
        const informational = error instanceof ApiError && error.status === 404;
        notify(message, describeApiError(error), informational ? null : 'error');
      }
    });
  });

  if (new URLSearchParams(location.search).get('checkout') === 'cancelled') {
    notify(message, 'Checkout cancelled — nothing was charged.', null);
    history.replaceState({}, '', '/membership');
  }
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
