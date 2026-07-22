/**
 * The `?next=` guard.
 *
 * Worth its own file because the failure mode is a security one rather than a
 * cosmetic one: a sign-in page that redirects wherever a URL parameter says is
 * an open redirect, handed to the player at the exact moment they have just
 * typed a password.
 *
 * Run: npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from '../src/lib/navigation.ts';

test('the routes the site actually hands off to are allowed', () => {
  assert.equal(safeNext('/membership'), '/membership');
  assert.equal(safeNext('/account'), '/account');
  assert.equal(safeNext('/'), '/');
  // `format: 'file'` builds mean a link may carry the extension.
  assert.equal(safeNext('/membership.html'), '/membership');
});

test('absent or empty means stay put', () => {
  assert.equal(safeNext(null), null);
  assert.equal(safeNext(undefined), null);
  assert.equal(safeNext(''), null);
});

test('anything off-origin is refused', () => {
  assert.equal(safeNext('https://evil.example'), null);
  assert.equal(safeNext('http://evil.example'), null);
  // Protocol-relative — the one that gets forgotten, and it is a real redirect.
  assert.equal(safeNext('//evil.example'), null);
  assert.equal(safeNext('/\\evil.example'), null);
  assert.equal(safeNext('/path\\..\\evil'), null);
  assert.equal(safeNext('javascript:alert(1)'), null);
  assert.equal(safeNext('data:text/html,<script>'), null);
});

test('an unknown same-origin path is refused too', () => {
  // The allow-list is the point: a real route today is not automatically a
  // legitimate post-sign-in destination tomorrow.
  assert.equal(safeNext('/legal/terms'), null);
  assert.equal(safeNext('/nope'), null);
});

test('query and fragment are dropped, not carried', () => {
  assert.equal(safeNext('/membership?checkout=success'), '/membership');
  assert.equal(safeNext('/account#delete'), '/account');
});
