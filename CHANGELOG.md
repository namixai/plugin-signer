# Changelog

All notable changes to `@usenami/plugin-signer` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is [SemVer](https://semver.org/).

## [0.2.0] — 2026-06-07 (all 6 venues)

Brings the plugin's venue manifest to all six venues the Signer gateway signs for
(was 3), in lockstep with `@usenami/signer-mcp` v0.2.0. The plugin is unpublished
prior to this, so 0.2.0 is the first npm release.

### Added
- `LIST_SIGNER_VENUES` now reports six venues — adds **kucoin** (KuCoin Futures,
  HMAC + v2 encrypted passphrase, symbol `XBTUSDTM`), **bybit** (Bybit V5 linear,
  HMAC, symbol `BTCUSDT`), and **hyperliquid_main** (Hyperliquid L1, EIP-712,
  symbol `BTC`).
- `PLACE_SIGNER_ORDER` / `GET_SIGNER_ACCOUNT` / `CANCEL_SIGNER_ORDER` accept the
  three new venue ids (validated against the shared `STATIC_VENUES` manifest).

### Changed
- Action descriptions + "venue required" / "need a venue" error messages now list
  all six venues (error messages derive the list from the manifest to avoid drift).
- `PLUGIN_VERSION` 0.1.0 → 0.2.0 (surfaces in the gateway `User-Agent`).
- README venue table + status line updated for 6 venues.

### Notes
- Order signing works for all six at the gateway (verify-all-blobs 6/6). The plugin
  returns the venue's raw response for account/order calls (no client-side
  normalization — unlike signer-mcp's parsers); live `get_account` activates per
  venue as the gateway enables each account-read endpoint.

## [0.1.0] — 2026-06-06 (initial release)

First publish. Thin ElizaOS wrapper around the Usenami Signer gateway, mirroring the same v0 contract as `@usenami/signer-mcp`.

### Added
- Actions:
  - `GET_SIGNER_ATTESTATION` — Nitro PCR0 + on-chain registration proof (read-only, no auth).
  - `LIST_SIGNER_VENUES` — static venue manifest (read-only, no auth).
  - `GET_SIGNER_ACCOUNT` — equity / free margin / positions via Option-A signed read.
  - `PLACE_SIGNER_ORDER` — market / limit orders on binance / okx / asterdex.
  - `CANCEL_SIGNER_ORDER` — cancel by venue `order_id` (+ `symbol` for binance / okx routes).
- Provider:
  - `SIGNER_ATTESTATION_PROVIDER` — surfaces the running enclave's PCR0 to the agent every turn, 60-second cached. Soft-fails to a "gateway unreachable" line so the agent stays usable if the signer is down.
- Env contract (same as signer-mcp): `SIGNER_GATEWAY_URL`, `SIGNER_API_TOKEN`, `SIGNER_FETCH_TIMEOUT_MS`.
- Re-exports `callGateway` / `submitSignedBundle` / `STATIC_VENUES` for custom agents that want to compose their own actions on top of the shared gateway layer.

### Known limits (deliberate)
- Single account per venue per `SIGNER_API_TOKEN`.
- No withdrawals / transfers / leverage configuration / multi-venue routing / streaming.
- Static venue manifest — refreshes on package release, not at runtime.
