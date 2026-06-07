/**
 * @usenami/plugin-signer — ElizaOS plugin for the Usenami Signer.
 *
 * Thin wrapper around the public Usenami Signer gateway (same HTTP contract
 * as @usenami/signer-mcp). Lets an ElizaOS agent place / cancel CEX orders
 * and query account state without ever holding the venue API key — the
 * HMAC / EIP-712 signature is computed inside an AWS Nitro Enclave.
 *
 * Same env vars as signer-mcp:
 *   SIGNER_GATEWAY_URL      (default https://signer.usenami.io)
 *   SIGNER_API_TOKEN        (required for everything except attestation/list)
 *   SIGNER_FETCH_TIMEOUT_MS (default 30000)
 *
 * Drop into a character's `plugins`:
 *   import signerPlugin from "@usenami/plugin-signer";
 *   export const character = { ..., plugins: [signerPlugin] };
 */

import type { Plugin } from "@elizaos/core";
import { getSignerAttestationAction } from "./actions/get-attestation.js";
import { listSignerVenuesAction } from "./actions/list-venues.js";
import { getSignerAccountAction } from "./actions/get-account.js";
import { placeSignerOrderAction } from "./actions/place-order.js";
import { cancelSignerOrderAction } from "./actions/cancel-order.js";
import { signerAttestationProvider } from "./providers/attestation.js";

export const signerPlugin: Plugin = {
  name: "@usenami/plugin-signer",
  description:
    "Trade perps on Binance / OKX / Asterdex / KuCoin / Bybit / Hyperliquid " +
    "through the Usenami Signer — keys never leave the AWS Nitro Enclave. " +
    "Includes a provider that surfaces the running enclave's PCR0 attestation " +
    "to the agent every turn.",
  actions: [
    getSignerAttestationAction,
    listSignerVenuesAction,
    getSignerAccountAction,
    placeSignerOrderAction,
    cancelSignerOrderAction,
  ],
  providers: [signerAttestationProvider],
};

export default signerPlugin;

// Re-export the building blocks so custom agents can compose their own
// actions on top of the shared gateway layer.
export {
  callGateway,
  submitSignedBundle,
  submitSignedRequest,
  isSignedRequest,
  GatewayError,
  PLUGIN_VERSION,
} from "./gateway.js";
export type {
  GatewayConfig,
  GatewayCallOpts,
  SignedRequest,
} from "./gateway.js";
export { STATIC_VENUES } from "./venues.js";
export type { VenueEntry } from "./venues.js";
export { readGatewayConfig, DEFAULT_GATEWAY_URL } from "./config.js";
