import type { Action } from "@elizaos/core";
import { callGateway, submitSignedBundle } from "../gateway.js";
import { readGatewayConfig } from "../config.js";
import { STATIC_VENUES } from "../venues.js";

interface CancelOrderInput {
  venue: string;
  order_id: string;
  symbol?: string;
}

function parseCancelInput(message: unknown): CancelOrderInput | string {
  if (!message || typeof message !== "object") return "no message content";
  const c = (message as { content?: unknown }).content as
    | Record<string, unknown>
    | undefined;
  if (!c) return "missing content";
  const params = (c.params ?? c) as Record<string, unknown>;
  const venue =
    typeof params.venue === "string" ? params.venue.toLowerCase() : undefined;
  const order_id =
    typeof params.order_id === "string" ? params.order_id : undefined;
  const symbol =
    typeof params.symbol === "string" ? params.symbol : undefined;
  if (!venue) return "venue required";
  if (!STATIC_VENUES.find((v) => v.venue === venue)) {
    return `unknown venue '${venue}'`;
  }
  if (!order_id) return "order_id required";
  if ((venue === "binance" || venue === "okx") && !symbol) {
    return `symbol required for ${venue} cancel route`;
  }
  return { venue, order_id, symbol };
}

export const cancelSignerOrderAction: Action = {
  name: "CANCEL_SIGNER_ORDER",
  similes: ["SIGNER_CANCEL", "KILL_SIGNER_ORDER", "PULL_SIGNER_ORDER"],
  description:
    "Cancel an outstanding order on a venue by order_id. Idempotent — " +
    "already-filled / already-cancelled orders return the venue's native " +
    "error rather than throwing locally.",
  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "cancel binance order 12345678 on BTCUSDT",
          params: { venue: "binance", order_id: "12345678", symbol: "BTCUSDT" },
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Cancelling.",
          actions: ["CANCEL_SIGNER_ORDER"],
        },
      },
    ],
  ],
  validate: async (runtime) => {
    const cfg = readGatewayConfig(runtime);
    return Boolean(cfg.apiToken);
  },
  handler: async (runtime, message, _state, _options, callback) => {
    const parsed = parseCancelInput(message);
    if (typeof parsed === "string") {
      if (callback) await callback({ text: `cancel_order error: ${parsed}` });
      return { success: false, error: parsed };
    }
    const cfg = readGatewayConfig(runtime);
    try {
      const signed = await callGateway<unknown>(
        "/sign/cancel",
        { method: "POST", body: parsed, authRequired: true },
        cfg,
      );
      const venueResponse = await submitSignedBundle(
        signed,
        cfg.fetchImpl,
        cfg.fetchTimeoutMs,
      );
      const text = `${parsed.venue} cancel ${parsed.order_id} submitted.`;
      if (callback) await callback({ text });
      return {
        success: true,
        text,
        data: { request: parsed, response: venueResponse },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `cancel_order failed: ${msg}` });
      return { success: false, error: msg };
    }
  },
};
