/**
 * Pure presentation helpers for /account.
 *
 * Kept out of the DOM controller so they can be unit-tested without a browser
 * (`npm test` → node:test). The copy decisions here are the load-bearing part:
 * §0.5 records that A6's refusal was misdescribed in the app because a view
 * hardcoded daily-reset copy over a *monthly* allowance. These functions read
 * the plan and say what is actually true.
 */

import type { MoMe } from './api';

export function planLabel(plan: string | undefined): string {
  switch (plan) {
    case 'plus':
      return 'Plus';
    case 'free':
    case undefined:
      return 'Free';
    default:
      return plan.charAt(0).toUpperCase() + plan.slice(1);
  }
}

/** "Songs you can make right now" — allowance + purchased credits, which the
 *  server spends in that order. This is the headline number in the app too, so
 *  the two surfaces agree by reading the same field rather than each computing
 *  its own total. */
export function balanceOf(me: MoMe): number {
  if (typeof me.balance === 'number') return me.balance;
  // A backend predating A6 sends no billing block at all. Showing "0" there
  // would be a lie (the daily quota is what governs), so it reads as unknown.
  return NaN;
}

export function balanceText(me: MoMe): string {
  const balance = balanceOf(me);
  return Number.isNaN(balance) ? '—' : String(balance);
}

/** The line under the balance. Free allowance renews monthly; Plus renews on
 *  the Stripe period end. Never "resets at midnight" — that is the *daily abuse
 *  quota*, a different number with a different reset, and conflating them is the
 *  exact mistake §0.5 flagged. */
export function renewalLine(me: MoMe, now: Date = new Date()): string {
  const allowance = me.allowanceRemaining;
  const credits = typeof me.balance === 'number' && typeof allowance === 'number' ? me.balance - allowance : null;

  const parts: string[] = [];
  if (typeof allowance === 'number') {
    parts.push(`${allowance} from your ${planLabel(me.plan).toLowerCase()} allowance`);
  }
  if (credits !== null && credits > 0) {
    parts.push(`${credits} purchased ${credits === 1 ? 'credit' : 'credits'}`);
  }

  const renews = me.renewsAt ? relativeDay(me.renewsAt, now) : null;
  if (renews) parts.push(`allowance renews ${renews}`);

  return parts.join(' · ');
}

/** The daily cap is an abuse ceiling, not the product (decision D5) — so it is
 *  shown as secondary detail and only when it is close enough to matter. */
export function dailyQuotaLine(me: MoMe): string | null {
  const quota = me.quota;
  if (!quota || typeof quota.limit !== 'number' || quota.limit <= 0) return null;
  const remaining = Math.max(0, quota.limit - quota.used);
  return `${remaining} of ${quota.limit} today`;
}

export function relativeDay(iso: string, now: Date = new Date()): string | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.round((then.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days} days`;
  return `on ${then.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
}

export function accountName(me: MoMe, email: string | null): string {
  return me.displayName?.trim() || email || 'Your account';
}
