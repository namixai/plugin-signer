import type { Action } from "@elizaos/core";
import { callGateway } from "../gateway.js";
import { readGatewayConfig } from "../config.js";

interface AttestationResponse {
  pcr0_sha384: string;
  registered_onchain: boolean;
  timestamp_ms: number;
}

export const getSignerAttestationAction: Action = {
  name: "GET_SIGNER_ATTESTATION",
  similes: ["VERIFY_SIGNER", "CHECK_ENCLAVE", "PROVE_KEY_ISOLATION"],
  description:
    "Fetch the Usenami Signer's AWS Nitro Enclave attestation document " +
    "(PCR0 + signature) so the agent can prove what code is signing " +
    "venue orders. Use whenever the user asks about trust, key custody, " +
    "or whether the signer can be verified.",
  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "Can you prove the signer's keys aren't on your machine?",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Pulling the Nitro attestation now.",
          actions: ["GET_SIGNER_ATTESTATION"],
        },
      },
    ],
  ],
  validate: async () => true,
  handler: async (runtime, _message, _state, _options, callback) => {
    const cfg = readGatewayConfig(runtime);
    try {
      const att = await callGateway<AttestationResponse>(
        "/attestation",
        { method: "GET" },
        cfg,
      );
      const text =
        `Signer PCR0: \`${att.pcr0_sha384}\`. ` +
        `Registered on-chain: ${att.registered_onchain ? "yes" : "no"}. ` +
        `Verify at usenami.io/signer/attestations.`;
      if (callback) await callback({ text });
      return {
        success: true,
        text,
        data: {
          pcr0_sha384: att.pcr0_sha384,
          registered_onchain: att.registered_onchain,
          timestamp_ms: att.timestamp_ms,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `attestation fetch failed: ${msg}` });
      return { success: false, error: msg };
    }
  },
};
