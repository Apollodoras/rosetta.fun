/**
 * The site's only unit tests: the pure copy decisions on /account.
 *
 * These exist because the one recorded account-UI bug in this project's history
 * (§0.5, the A6 refusal) was a *copy* bug, not a logic bug — a view asserted a
 * daily reset over a monthly allowance. The DOM wiring is verified by driving a
 * real browser (A8 verification); what's worth pinning here is what the numbers
 * are allowed to say.
 *
 * Run: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceText, dailyQuotaLine, planLabel, relativeDay, renewalLine, accountName } from '../src/lib/format.ts';
import type { MoMe } from '../src/lib/api.ts';

const base: MoMe = { userID: 'uid_1' };
const NOW = new Date('2026-07-19T12:00:00Z');

test('a missing billing block reads as unknown, never as zero', () => {
  // "0 songs" on a backend that never sent a balance would tell the player they
  // are out when they are not.
  assert.equal(balanceText(base), '—');
  assert.equal(balanceText({ ...base, balance: 0 }), '0');
  assert.equal(balanceText({ ...base, balance: 7 }), '7');
});

test('plan labels', () => {
  assert.equal(planLabel(undefined), 'Free');
  assert.equal(planLabel('free'), 'Free');
  assert.equal(planLabel('plus'), 'Plus');
  assert.equal(planLabel('legacy'), 'Legacy');
});

test('the renewal line splits allowance from purchased credits', () => {
  const me: MoMe = { ...base, balance: 13, allowanceRemaining: 3, plan: 'free' };
  const line = renewalLine(me, NOW);
  assert.match(line, /3 from your free allowance/);
  assert.match(line, /10 purchased credits/);
});

test('one credit is singular', () => {
  const line = renewalLine({ ...base, balance: 4, allowanceRemaining: 3 }, NOW);
  assert.match(line, /1 purchased credit(?!s)/);
});

test('no credits line when the balance is allowance only', () => {
  const line = renewalLine({ ...base, balance: 3, allowanceRemaining: 3 }, NOW);
  assert.doesNotMatch(line, /purchased/);
});

test('renewal reads from renewsAt and never claims a daily reset', () => {
  const me: MoMe = {
    ...base,
    balance: 3,
    allowanceRemaining: 3,
    renewsAt: '2026-08-01T00:00:00Z',
    quota: { used: 1, limit: 25, resetsAtUTC: '2026-07-20T00:00:00Z' },
  };
  const line = renewalLine(me, NOW);
  assert.match(line, /allowance renews in 13 days/);
  // The daily quota's midnight reset must not leak into the allowance line —
  // this is the exact conflation §0.5 flagged in the app.
  assert.doesNotMatch(line, /today|tomorrow|midnight/);
});

test('relativeDay wording', () => {
  assert.equal(relativeDay('2026-07-19T18:00:00Z', NOW), 'today');
  assert.equal(relativeDay('2026-07-20T14:00:00Z', NOW), 'tomorrow');
  assert.equal(relativeDay('2026-07-25T12:00:00Z', NOW), 'in 6 days');
  assert.match(relativeDay('2026-09-01T12:00:00Z', NOW)!, /^on /);
  assert.equal(relativeDay('not-a-date', NOW), null);
  // A date already past reads as "today" rather than a negative countdown.
  assert.equal(relativeDay('2026-07-01T00:00:00Z', NOW), 'today');
});

test('the daily cap is shown only when the server sets one', () => {
  assert.equal(dailyQuotaLine(base), null);
  assert.equal(dailyQuotaLine({ ...base, quota: { used: 0, limit: 0 } }), null);
  assert.equal(dailyQuotaLine({ ...base, quota: { used: 3, limit: 25 } }), '22 of 25 today');
  // A cap lowered under the player mid-day must clamp at 0, not go negative.
  assert.equal(dailyQuotaLine({ ...base, quota: { used: 30, limit: 25 } }), '0 of 25 today');
});

test('account name falls back through display name, email, then a generic', () => {
  assert.equal(accountName({ ...base, displayName: 'Tahar' }, 'a@b.com'), 'Tahar');
  assert.equal(accountName({ ...base, displayName: '  ' }, 'a@b.com'), 'a@b.com');
  assert.equal(accountName(base, null), 'Your account');
});
