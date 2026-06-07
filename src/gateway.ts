/**
 * Gateway HTTP — single chokepoint for Usenami Signer gateway calls.
 *
 * Mirrors the contract used by @usenami/signer-mcp (same env vars, same paths,
 * same Option-A signed-request bundle pattern). Re-implemented here rather than
 * imported so the plugin stays a stand-alone npm package — the durable contract
 * between mcp/eliza/future clients is the gateway HTTP protocol, not shared TS.
 */

export const PLUGIN_VERSION = "0.2.0";
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export interface GatewayConfig {
  gatewayUrl: string;
  apiToken?: string;
  fetchTimeoutMs?: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface GatewayCallOpts {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  authRequired?: boolean;
}

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly endpoint: string,
  ) {
    super(`gateway ${endpoint} failed (${status}): ${body.slice(0, 240)}`);
    this.name = "GatewayError";
  }
}

export async function callGateway<T>(
  path: string,
  opts: GatewayCallOpts,
  cfg: GatewayConfig,
): Promise<T> {
  const method = opts.method ?? "GET";
  const hasToken = Boolean(cfg.apiToken && cfg.apiToken.length > 0);
  if (opts.authRequired && !hasToken) {
    throw new Error(
      `SIGNER_API_TOKEN is required to call ${path}. Set it in the agent's ` +
        `ElizaOS character env. (Issue tokens at https://usenami.io/signer.)`,
    );
  }
  const url = `${cfg.gatewayUrl.replace(/\/+$/, "")}${path}`;
  const timeoutMs = cfg.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const fetchFn = cfg.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": `@usenami/plugin-signer@${PLUGIN_VERSION}`,
    };
    if (hasToken) headers.Authorization = `Bearer ${cfg.apiToken}`;
    let serialized: string | undefined;
    if (opts.body !== undefined) {
      serialized = JSON.stringify(opts.body);
      headers["Content-Type"] = "application/json";
    }
    const res = await fetchFn(url, {
      method,
      headers,
      body: serialized,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new GatewayError(res.status, text, path);
    return text.length === 0 ? (undefined as unknown as T) : JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

// ── Option-A signed-request bundle ──
// /account, /sign/order, /sign/cancel return either a single SignedRequest
// or a composite of named SignedRequests (OKX /account = {balance, positions}).
// The plugin submits the signed bundle to the venue and returns its raw response.

export interface SignedRequest {
  venue: string;
  method: "GET" | "POST" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export function isSignedRequest(x: unknown): x is SignedRequest {
  if (x === null || typeof x !== "object") return false;
  const obj = x as Record<string, unknown>;
  return (
    typeof obj.venue === "string" &&
    typeof obj.method === "string" &&
    typeof obj.url === "string" &&
    obj.headers !== null &&
    typeof obj.headers === "object"
  );
}

export async function submitSignedRequest(
  req: SignedRequest,
  fetchImpl?: typeof fetch,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<unknown> {
  const fetchFn = fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `venue ${req.venue} ${req.method} ${req.url.split("?")[0]} failed ` +
          `(${res.status}): ${text.slice(0, 240)}`,
      );
    }
    if (text.length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function submitSignedBundle(
  bundle: unknown,
  fetchImpl?: typeof fetch,
  timeoutMs?: number,
): Promise<unknown> {
  if (isSignedRequest(bundle)) {
    return submitSignedRequest(bundle, fetchImpl, timeoutMs);
  }
  if (bundle === null || typeof bundle !== "object") {
    throw new Error(
      "Unexpected gateway response shape: not a SignedRequest and not a " +
        "composite object. Gateway must return {method,url,headers} or " +
        "{key: {method,url,headers}, ...}.",
    );
  }
  const entries = Object.entries(bundle as Record<string, unknown>);
  const submitted = await Promise.all(
    entries.map(async ([k, v]) => {
      if (!isSignedRequest(v)) {
        throw new Error(
          `Composite gateway response key "${k}" is not a SignedRequest.`,
        );
      }
      const out = await submitSignedRequest(v, fetchImpl, timeoutMs);
      return [k, out] as const;
    }),
  );
  return Object.fromEntries(submitted);
}
