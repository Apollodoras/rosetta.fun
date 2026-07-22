/**
 * The mo-backend client for the web.
 *
 * Deliberately the same shape as the iOS `RemoteMoMeFetcher`: same base URL,
 * same `Authorization: Bearer <Firebase ID token>`, and the token is fetched
 * **per request** rather than cached — a Firebase ID token expires hourly, and a
 * stale one is the exact failure A1/A2 were about.
 *
 * There is no session cookie of ours anywhere in this file, by design
 * (ROSETTA_FUN §5.1). The ID token lives in memory, held by the Firebase SDK.
 */

export interface MoQuota {
  used: number;
  limit: number;
  resetsAtUTC?: string;
}

/** `GET /v1/me`. Every billing field is optional for the same back-compat reason
 *  the Swift `MoMe` makes them optional — a backend predating A6 still decodes. */
export interface MoMe {
  userID: string;
  displayName?: string | null;
  quota?: MoQuota;
  emailVerified?: boolean;
  signInProvider?: string;
  balance?: number;
  plan?: string;
  allowanceRemaining?: number;
  renewsAt?: string;
}

export interface DeleteResult {
  deleted: number;
  siwaRevocation?: string;
  stripeSubscription?: string;
}

/** An error carrying the backend's own human-readable message.
 *
 *  Every backend error body is `{"message": "<human-readable>"}` (a §0
 *  invariant), and those strings are written to be shown to a player. Surfacing
 *  them beats inventing client-side copy that drifts — the A6 lesson recorded in
 *  §0.5, where the app hardcoded "you've used today's songs" over a message that
 *  actually said the player was out of credits. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type TokenProvider = () => Promise<string>;

export class MoApi {
  constructor(
    private readonly baseURL: string,
    private readonly token: TokenProvider,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const idToken = await this.token();
    let response: Response;
    try {
      response = await fetch(`${this.baseURL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } catch (cause) {
      // A network failure and a CORS rejection are indistinguishable to fetch.
      // CORS is the likely one right after a deploy (the origin must be in
      // MO_CORS_ORIGINS), so the message names it rather than blaming the user's
      // connection alone.
      throw new ApiError(0, "Couldn't reach Rosetta's servers. Check your connection and try again.");
    }

    if (!response.ok) {
      throw new ApiError(response.status, await messageFrom(response));
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  me(): Promise<MoMe> {
    return this.request<MoMe>('/v1/me');
  }

  /** Server-side data only. The caller deletes the Firebase identity after this
   *  succeeds — same ordering as the app (A3): server first, while a token still
   *  exists to authorize it; identity second. Both halves are idempotent, so a
   *  crash between them is resumable. */
  deleteServerData(): Promise<DeleteResult> {
    return this.request<DeleteResult>('/v1/me', { method: 'DELETE' });
  }

  async checkoutURL(priceID: string, successURL: string, cancelURL: string): Promise<string> {
    const body = await this.request<{ url: string }>('/web/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceID, successURL, cancelURL }),
    });
    return body.url;
  }

  async portalURL(returnURL: string): Promise<string> {
    const body = await this.request<{ url: string }>('/web/portal', {
      method: 'POST',
      body: JSON.stringify({ returnURL }),
    });
    return body.url;
  }
}

async function messageFrom(response: Response): Promise<string> {
  try {
    const body = await response.json();
    // FastAPI wraps a raised HTTPException's detail; the backend puts its
    // `{"message": ...}` object *inside* that detail. Both shapes are read so
    // this doesn't depend on which layer raised.
    const message = body?.detail?.message ?? body?.message ?? body?.detail;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    /* fall through to the generic line below */
  }
  if (response.status === 401) return 'Your session expired — sign in again.';
  return 'Something went wrong. Try again shortly.';
}
