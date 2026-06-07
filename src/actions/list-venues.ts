import type { Action } from "@elizaos/core";
import { STATIC_VENUES } from "../venues.js";

export const listSignerVenuesAction: Action = {
  name: "LIST_SIGNER_VENUES",
  similes: ["WHICH_VENUES_SIGNER", "SIGNER_SUPPORTED_EXCHANGES"],
  description:
    "List the CEX/DEX venues the Usenami Signer can trade through. Read-only " +
    "static manifest — no gateway call, no auth required.",
  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "What venues can the signer trade?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Listing supported venues.",
          actions: ["LIST_SIGNER_VENUES"],
        },
      },
    ],
  ],
  validate: async () => true,
  handler: async (_runtime, _message, _state, _options, callback) => {
    const summary = STATIC_VENUES.map(
      (v) => `${v.venue} (${v.asset_class}, ${v.auth_scheme})`,
    ).join(", ");
    const text = `Signer-supported venues: ${summary}.`;
    if (callback) await callback({ text });
    return {
      success: true,
      text,
      data: { venues: STATIC_VENUES },
    };
  },
};
