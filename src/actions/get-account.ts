import type { Action } from "@elizaos/core";
import { callGateway, submitSignedBundle } from "../gateway.js";
import { readGatewayConfig } from "../config.js";
import { STATIC_VENUES } from "../venues.js";

function extractVenue(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const content = (message as { content?: unknown }).content;
  if (!content || typeof content !== "object") return undefined;
  const venue =
    (content as { venue?: unknown }).venue ??
    (content as { params?: { venue?: unknown } }).params?.venue;
  if (typeof venue !== "string") return undefined;
  const known = STATIC_VENUES.find((v) => v.venue === venue.toLowerCase());
  return known?.venue;
}

export const getSignerAccountAction: Action = {
  name: "GET_SIGNER_ACCOUNT",
  similes: ["SIGNER_BALANCE", "SIGNER_MARGIN", "SIGNER_POSITIONS"],
  description:
    "Read equity, free margin, and open positions for a venue (binance / okx / " +
    "asterdex / kucoin / bybit / hyperliquid_main) through the Usenami Signer. " +
    "The plugin asks the gateway for a signed read request, then submits it to " +
    "the venue and returns the parsed balance. The agent never sees the " +
    "underlying API key.",
  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "what's my OKX balance through the signer?",
          venue: "okx",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Querying signer account.",
          actions: ["GET_SIGNER_ACCOUNT"],
        },
      },
    ],
  ],
  validate: async (runtime) => {
    const cfg = readGatewayConfig(runtime);
    return Boolean(cfg.apiToken);
  },
  handler: async (runtime, message, _state, _options, callback) => {
    const venue = extractVenue(message);
    if (!venue) {
      const known = STATIC_VENUES.map((v) => v.venue).join(" / ");
      const text = `Need a venue (${known}) to fetch the account.`;
      if (callback) await callback({ text });
      return { success: false, error: text };
    }
    const cfg = readGatewayConfig(runtime);
    try {
      const signed = await callGateway<unknown>(
        `/account?venue=${encodeURIComponent(venue)}`,
        { method: "GET", authRequired: true },
        cfg,
      );
      const venueResponse = await submitSignedBundle(
        signed,
        cfg.fetchImpl,
        cfg.fetchTimeoutMs,
      );
      const text = `Signer ${venue} account response received.`;
      if (callback) await callback({ text });
      return {
        success: true,
        text,
        data: { venue, response: venueResponse },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `account fetch failed: ${msg}` });
      return { success: false, error: msg };
    }
  },
};
