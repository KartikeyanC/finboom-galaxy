/**
 * The Account Aggregator vendor seam.
 *
 * FinRoot does not talk to the AA network itself — that needs FIU
 * registration and an AA licence relationship. A vendor (Setu, Finvu, …)
 * does, and FinRoot asks it for the decrypted data of a finished data
 * session. Choosing and paying a vendor is the owner's decision (CLAUDE.md:
 * no new paid services without approval), so nothing here runs until the
 * AA_* secrets are set: `aaVendorFromEnv()` returns null and the webhook
 * answers 503 for anything that needs a fetch.
 *
 * Only the fetch is vendor-specific. Webhook verification, routing,
 * normalisation and de-duplication are shared (`aa-webhook/handler.ts`).
 */

export interface AaVendor {
  readonly name: string;
  /** The decrypted FI payload of a completed data session. */
  fetchSessionData(sessionId: string): Promise<unknown>;
}

export class AaVendorError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AaVendorError";
  }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Setu AA (FIU) — data sessions are read with GET /v2/sessions/{id} and three
 * credential headers. CHECK THE PATH AND HEADERS AGAINST SETU'S CURRENT DOCS
 * before going live: they are written from Setu's v2 API as of 2026 and have
 * not been exercised against a real sandbox from this repo.
 */
export class SetuAaVendor implements AaVendor {
  readonly name = "setu";

  constructor(
    private readonly cfg: {
      baseUrl: string;
      clientId: string;
      clientSecret: string;
      productInstanceId: string;
    },
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async fetchSessionData(sessionId: string): Promise<unknown> {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(sessionId)) {
      throw new AaVendorError("bad session id");
    }
    const res = await this.fetchFn(
      `${this.cfg.baseUrl.replace(/\/+$/, "")}/v2/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: {
          "x-client-id": this.cfg.clientId,
          "x-client-secret": this.cfg.clientSecret,
          "x-product-instance-id": this.cfg.productInstanceId,
          accept: "application/json",
        },
      },
    );
    if (!res.ok) throw new AaVendorError(`setu session fetch failed: ${res.status}`, res.status);
    return await res.json();
  }
}

/** The configured vendor, or null when AA is not set up (the default). */
export function aaVendorFromEnv(env: (k: string) => string, fetchFn?: Fetch): AaVendor | null {
  const vendor = env("AA_VENDOR").trim().toLowerCase();
  if (vendor === "setu") {
    const cfg = {
      baseUrl: env("AA_BASE_URL"),
      clientId: env("AA_CLIENT_ID"),
      clientSecret: env("AA_CLIENT_SECRET"),
      productInstanceId: env("AA_PRODUCT_INSTANCE_ID"),
    };
    if (Object.values(cfg).some((v) => !v)) return null;
    if (!cfg.baseUrl.startsWith("https://")) return null;
    return new SetuAaVendor(cfg, fetchFn);
  }
  return null;
}
