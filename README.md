# @usenami/plugin-signer

> ElizaOS plugin: place / cancel CEX & DEX perp orders, read account state, and verify the running Nitro Enclave attestation — **the venue API key never enters the agent process.**

[![npm](https://img.shields.io/npm/v/@usenami/plugin-signer)](https://www.npmjs.com/package/@usenami/plugin-signer)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

This is the public source mirror of [`@usenami/plugin-signer`](https://www.npmjs.com/package/@usenami/plugin-signer), the ElizaOS plugin for the [Usenami Signer](https://usenami.io/signer). It's a thin client over the public Signer gateway — the same HTTP contract as the [`@usenami/signer-mcp`](https://github.com/namixai/signer-mcp) MCP server, so a token issued for one works with the other.

## Why

If your ElizaOS agent trades on a CEX today, the API key sits in agent memory or a `.env` the agent process can read. Compromise the agent — prompt injection, a poisoned dependency, a stray log line — and the key leaks.

Usenami Signer keeps the key inside an **AWS Nitro Enclave**. HMAC and EIP-712 signatures are computed inside attested code; the plugin asks the gateway for a signed venue request, submits it, and reads the response. The key is never on disk, never in agent-addressable memory, and the running code is provable via the enclave's `PCR0` measurement.

## Install

```bash
npm install @usenami/plugin-signer
```

## Quickstart

Add the plugin to your character and point it at the Signer:

```ts
import signerPlugin from "@usenami/plugin-signer";

export const character = {
  // ...existing config
  plugins: [signerPlugin],
  settings: {
    secrets: {
      SIGNER_GATEWAY_URL: "https://signer.usenami.io",
      SIGNER_API_TOKEN: "your-token-from-usenami.io/signer",
    },
  },
};
```

For local dev you can also put the same vars in `.env`.

### Actions the agent gets

| Name | Auth | Purpose |
|---|---|---|
| `GET_SIGNER_ATTESTATION` | none | Fetch the running enclave's PCR0 + `registered_onchain` flag — the trust receipt. |
| `LIST_SIGNER_VENUES` | none | Static manifest of the 6 supported venues + auth schemes. |
| `GET_SIGNER_ACCOUNT` | token | Equity / free margin / positions for a venue (read-only signed request). |
| `PLACE_SIGNER_ORDER` | token | Single market or limit order. Enclave enforces per-asset signature caps. |
| `CANCEL_SIGNER_ORDER` | token | Cancel by `order_id` (+ `symbol` for binance / okx routes). |

A provider, `SIGNER_ATTESTATION_PROVIDER`, surfaces a one-line `[signer] PCR0=… on-chain=…` snippet to the agent's context every turn (60-second cache), so the agent can always answer "what code is signing my orders?".

## Supported venues (6)

`LIST_SIGNER_VENUES` returns these — read-only, no gateway call:

| `venue` id          | asset class | auth scheme          | symbol example  |
|---------------------|-------------|----------------------|-----------------|
| `binance`           | perp        | hmac_sha256          | `BTCUSDT`       |
| `okx`               | perp        | hmac_sha256          | `BTC-USDT-SWAP` |
| `asterdex`          | perp        | eip712 (bsc)         | `BTC-USD`       |
| `kucoin`            | perp        | hmac_sha256          | `XBTUSDTM`      |
| `bybit`             | perp        | hmac_sha256          | `BTCUSDT`       |
| `hyperliquid_main`  | perp        | eip712 (hyperliquid) | `BTC`           |

Which venues a given token may trade is bound server-side to that token's policy; `LIST_SIGNER_VENUES` reports the full set the gateway can sign.

## Security model

- **Keys never leave the enclave.** Generated and used inside an AWS Nitro Enclave; there is no exportable form.
- **Attestation.** `GET_SIGNER_ATTESTATION` returns the enclave's `PCR0` (the AWS-signed measurement of the running code) plus an on-chain registration flag. Verify `PCR0` against the published build at [usenami.io/signer](https://usenami.io/signer) and the on-chain registry at `0x38b42eED740b0fDeb211bBDf773F2238cAEec240` on Base mainnet.
- **KMS envelope.** The encrypted key material is bound by a KMS policy to that exact attested `PCR0` — only the attested enclave can decrypt it.
- **Policy caps.** Every signature is bounded by a per-token policy (per-asset / per-venue caps) enforced inside the enclave before signing. A compromised agent can at worst place orders inside your policy window.

## Links

- Landing: [usenami.io/signer](https://usenami.io/signer)
- npm: [@usenami/plugin-signer](https://www.npmjs.com/package/@usenami/plugin-signer)
- MCP server (Claude Desktop / Cursor): [@usenami/signer-mcp](https://github.com/namixai/signer-mcp)

## Source of truth

This repo is an allowlisted mirror of the plugin developed in the Usenami monorepo. File issues here; releases are published to npm from the monorepo CI.

## License

MIT — see [LICENSE](./LICENSE).
