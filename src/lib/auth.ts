/**
 * Firebase Web SDK auth — the web half of "one identity everywhere".
 *
 * The same `mo-rosetta` Firebase project the iOS app uses, so a player who signs
 * in here resolves to the **same uid** and sees the same balance. That shared
 * uid is the entire point of this phase; there is no second auth system and no
 * server session of our own.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  GoogleAuthProvider,
  TwitterAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
  type Auth,
  type User,
} from 'firebase/auth';
import type { AuthMethod, SiteConfig } from './config';

export type { User };

/** A provider instance per method. Apple is an `OAuthProvider('apple.com')` —
 *  Firebase has no dedicated Apple class — and asks for the same two scopes the
 *  native flow does so the uid and the profile match across app and web. */
function providerFor(method: Exclude<AuthMethod, 'password'>) {
  switch (method) {
    case 'google':
      return new GoogleAuthProvider();
    case 'twitter':
      return new TwitterAuthProvider();
    case 'facebook':
      return new FacebookAuthProvider();
    case 'apple': {
      const apple = new OAuthProvider('apple.com');
      apple.addScope('email');
      apple.addScope('name');
      return apple;
    }
  }
}

export class WebAuth {
  readonly auth: Auth;
  private readonly app: FirebaseApp;

  constructor(config: SiteConfig) {
    this.app = initializeApp(config.firebase);
    this.auth = getAuth(this.app);
    // The player's browser language, not ours — this is what Firebase's
    // verification and password-reset emails are written in.
    this.auth.useDeviceLanguage();
  }

  onChange(handler: (user: User | null) => void): () => void {
    return onAuthStateChanged(this.auth, handler);
  }

  get current(): User | null {
    return this.auth.currentUser;
  }

  /** The token seam handed to `MoApi`. Fetched per request; `false` means "use
   *  the cached one unless it's expired", which is Firebase's own refresh
   *  handling and the right default — forcing a refresh on every call would add
   *  a network round-trip to every request. */
  token = async (): Promise<string> => {
    const user = this.auth.currentUser;
    if (!user) throw new Error('not signed in');
    return user.getIdToken();
  };

  signInWith(method: Exclude<AuthMethod, 'password'>) {
    return signInWithPopup(this.auth, providerFor(method));
  }

  signInWithPassword(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async signUpWithPassword(email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    // A4: a password account is unverified by construction and its spendable
    // allowance is genuinely zero until it verifies, so the email goes out
    // immediately rather than waiting for the player to discover the block.
    await sendEmailVerification(credential.user);
    return credential;
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  resendVerification() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('not signed in');
    return sendEmailVerification(user);
  }

  signOut() {
    return signOut(this.auth);
  }

  /** Firebase requires a recent login before deleting an account. A password
   *  account re-enters its password; a federated one re-runs its provider popup
   *  — the same two-shaped reauth the app's delete sheet performs (A3). */
  async reauthenticate(password?: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('not signed in');

    const providerId = user.providerData[0]?.providerId ?? 'password';
    if (providerId === 'password') {
      if (!password) throw new Error('password required');
      const credential = EmailAuthProvider.credential(user.email ?? '', password);
      await reauthenticateWithCredential(user, credential);
      return;
    }
    const method = methodForProviderID(providerId);
    if (!method) throw new Error(`can't re-authenticate ${providerId}`);
    await reauthenticateWithPopup(user, providerFor(method));
  }

  /** The identity half of deletion. The caller deletes server data FIRST (A3
   *  ordering) — once the Firebase user is gone there is no token left to
   *  authorize the backend call. */
  async deleteIdentity(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return; // already gone — deletion is idempotent by design
    await deleteUser(user);
  }
}

export function methodForProviderID(providerId: string): Exclude<AuthMethod, 'password'> | null {
  switch (providerId) {
    case 'google.com':
      return 'google';
    case 'apple.com':
      return 'apple';
    case 'twitter.com':
      return 'twitter';
    case 'facebook.com':
      return 'facebook';
    default:
      return null;
  }
}

export function isPasswordAccount(user: User): boolean {
  return (user.providerData[0]?.providerId ?? 'password') === 'password';
}

/** Firebase's error codes are not player-facing English. Map the ones a player
 *  can actually cause; anything else falls back to the SDK's message. */
export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return "That doesn't look like an email address.";
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/weak-password':
      return 'Pick a longer password — at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'There’s already an account with that email. Try signing in.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match an account.";
    case 'auth/too-many-requests':
      return 'Too many attempts — wait a minute and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in window — allow popups for this site and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'You already have an account with that email using a different sign-in method.';
    case 'auth/requires-recent-login':
      return 'For your security, sign in again before making this change.';
    case 'auth/unauthorized-domain':
      // The single most likely first-deploy failure, so it says exactly what to fix.
      return 'This domain isn’t authorized for sign-in yet (Firebase console → Authentication → Settings → Authorized domains).';
    case 'auth/operation-not-allowed':
      return 'That sign-in method isn’t enabled for this project yet.';
    default:
      return (error as Error)?.message || 'Sign-in failed. Try again shortly.';
  }
}
