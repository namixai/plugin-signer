import type { Provider } from "@elizaos/core";
import { callGateway } from "../gateway.js";
import { readGatewayConfig } from "../config.js";

interface AttestationResponse extends Record<string, unknown> {
  pcr0_sha384: string;
  registered_onchain: boolean;
  timestamp_ms: number;
}

/**
 * Surfaces the running enclave's PCR0 to the agent every turn so it can
 * accurately answer "what code is signing my orders?". Cached for 60s to
 * avoid hitting the gateway on every message — PCR0 only changes on enclave
 * restart / cutover.
 *
 * On gateway failure we return a soft message rather than throw, so the
 * agent stays usable even if the signer gateway is unreachable.
 */
const CACHE_TTL_MS = 60_000;
let cached: { att: AttestationResponse; fetchedAt: number } | undefined;
let inFlight: Promise<AttestationResponse | undefined> | undefined;

async function fetchAttestation(
  runtime: Parameters<Provider["get"]>[0],
): Promise<AttestationResponse | undefined> {
  const cfg = readGatewayConfig(runtime);
  // Reuse an in-flight fetch so concurrent provider calls don't fan out.
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      return await callGateway<AttestationResponse>(
        "/attestation",
        { method: "GET" },
        cfg,
      );
    } catch {
      return undefined;
    }
  })().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

export const signerAttestationProvider: Provider = {
  name: "SIGNER_ATTESTATION_PROVIDER",
  dynamic: true,
  get: async (runtime) => {
    const now = nowMs();
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      const { att } = cached;
      return {
        text:
          `[signer] running enclave PCR0=${att.pcr0_sha384.slice(0, 12)}…, ` +
          `on-chain=${att.registered_onchain ? "yes" : "no"}.`,
        data: att,
      };
    }
    const att = await fetchAttestation(runtime);
    if (!att) {
      return {
        text: "[signer] attestation unavailable (gateway unreachable).",
        data: { error: "gateway_unreachable" },
      };
    }
    cached = { att, fetchedAt: now };
    return {
      text:
        `[signer] running enclave PCR0=${att.pcr0_sha384.slice(0, 12)}…, ` +
        `on-chain=${att.registered_onchain ? "yes" : "no"}.`,
      data: att,
    };
  },
};

// Wrap Date.now so tests can override the cache clock.
let nowMs: () => number = () => Date.now();
export function __setClockForTests(impl: () => number): void {
  nowMs = impl;
}
export function __resetCacheForTests(): void {
  cached = undefined;
  inFlight = undefined;
  nowMs = () => Date.now();
}
