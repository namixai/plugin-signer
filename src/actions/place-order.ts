import type { Action } from "@elizaos/core";
import { callGateway, submitSignedBundle } from "../gateway.js";
import { readGatewayConfig } from "../config.js";
import { STATIC_VENUES } from "../venues.js";

interface PlaceOrderInput {
  venue: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit";
  price?: number;
  policy_id?: string;
}

function parsePlaceOrderInput(message: unknown): PlaceOrderInput | string {
  if (!message || typeof message !== "object") return "no message content";
  const c = (message as { content?: unknown }).content as
    | Record<string, unknown>
    | undefined;
  if (!c) return "missing content";
  const params = (c.params ?? c) as Record<string, unknown>;
  const venue = typeof params.venue === "string" ? params.venue.toLowerCase() : undefined;
  const symbol = typeof params.symbol === "string" ? params.symbol : undefined;
  const side = params.side === "buy" || params.side === "sell" ? params.side : undefined;
  const type =
    params.type === "market" || params.type === "limit" ? params.type : undefined;
  const qty = typeof params.qty === "number" ? params.qty : undefined;
  const price = typeof params.price === "number" ? params.price : undefined;
  const policy_id =
    typeof params.policy_id === "string" ? params.policy_id : undefined;
  if (!venue) {
    return `venue required (${STATIC_VENUES.map((v) => v.venue).join(" / ")})`;
  }
  if (!STATIC_VENUES.find((v) => v.venue === venue)) {
    return `unknown venue '${venue}'`;
  }
  if (!symbol) return "symbol required";
  if (!side) return "side must be 'buy' or 'sell'";
  if (!type) return "type must be 'market' or 'limit'";
  if (qty === undefined || qty <= 0) return "qty must be a positive number";
  if (type === "limit" && price === undefined) {
    return "price required for limit orders";
  }
  return { venue, symbol, side, qty, type, price, policy_id };
}

export const placeSignerOrderAction: Action = {
  name: "PLACE_SIGNER_ORDER",
  similes: ["SIGNER_TRADE", "SIGNER_BUY", "SIGNER_SELL", "SIGNER_OPEN_POSITION"],
  description:
    "Place a single market or limit order on a CEX/DEX perp venue (binance / " +
    "okx / asterdex / kucoin / bybit / hyperliquid_main) through the Usenami " +
    "Signer. The HMAC or EIP-712 signature is produced INSIDE the Nitro " +
    "Enclave from a key the agent never sees. Enclave-side policy enforces " +
    "per-asset signature caps. Symbols: BTCUSDT (binance/bybit), " +
    "BTC-USDT-SWAP (okx), BTC-USD (asterdex), XBTUSDTM (kucoin), BTC " +
    "(hyperliquid_main).",
  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "buy 0.001 BTC on binance testnet through signer",
          params: {
            venue: "binance",
            symbol: "BTCUSDT",
            side: "buy",
            qty: 0.001,
            type: "market",
          },
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Signing and submitting order through the enclave.",
          actions: ["PLACE_SIGNER_ORDER"],
        },
      },
    ],
  ],
  validate: async (runtime) => {
    const cfg = readGatewayConfig(runtime);
    return Boolean(cfg.apiToken);
  },
  handler: async (runtime, message, _state, _options, callback) => {
    const parsed = parsePlaceOrderInput(message);
    if (typeof parsed === "string") {
      if (callback) await callback({ text: `place_order error: ${parsed}` });
      return { success: false, error: parsed };
    }
    const cfg = readGatewayConfig(runtime);
    try {
      const signed = await callGateway<unknown>(
        "/sign/order",
        { method: "POST", body: parsed, authRequired: true },
        cfg,
      );
      const venueResponse = await submitSignedBundle(
        signed,
        cfg.fetchImpl,
        cfg.fetchTimeoutMs,
      );
      const text =
        `${parsed.venue} ${parsed.side} ${parsed.qty} ${parsed.symbol} ` +
        `(${parsed.type}) submitted via signer.`;
      if (callback) await callback({ text });
      return {
        success: true,
        text,
        data: { request: parsed, response: venueResponse },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `place_order failed: ${msg}` });
      return { success: false, error: msg };
    }
  },
};
