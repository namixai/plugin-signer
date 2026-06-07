/**
 * Read plugin config from the ElizaOS runtime. Falls back to process.env so
 * developers can still set values via `.env`.
 *
 * Same env contract as @usenami/signer-mcp:
 *   SIGNER_GATEWAY_URL      default https://signer.usenami.io
 *   SIGNER_API_TOKEN        required for everything except attestation+list_venues
 *   SIGNER_FETCH_TIMEOUT_MS default 30000
 */

import type { IAgentRuntime } from "@elizaos/core";
import type { GatewayConfig } from "./gateway.js";

export const DEFAULT_GATEWAY_URL = "https://signer.usenami.io";

function settingString(runtime: IAgentRuntime, key: string): string | undefined {
  const raw = runtime.getSetting(key);
  if (raw === undefined || raw === null || raw === "") return undefined;
  return String(raw);
}

export function readGatewayConfig(runtime: IAgentRuntime): GatewayConfig {
  const gatewayUrl =
    settingString(runtime, "SIGNER_GATEWAY_URL") ?? DEFAULT_GATEWAY_URL;
  const apiToken = settingString(runtime, "SIGNER_API_TOKEN");
  const timeoutRaw = settingString(runtime, "SIGNER_FETCH_TIMEOUT_MS");
  const fetchTimeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
  return {
    gatewayUrl,
    apiToken,
    fetchTimeoutMs:
      fetchTimeoutMs !== undefined && Number.isFinite(fetchTimeoutMs)
        ? fetchTimeoutMs
        : undefined,
  };
}
