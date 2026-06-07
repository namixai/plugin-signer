/**
 * Static venue manifest. Mirrors the contract used by @usenami/signer-mcp
 * (v0.2.0) — same six venues, same auth schemes. If the gateway ever returns
 * this list dynamically (post-v0), swap this constant for a `callGateway` cache.
 */

export interface VenueEntry {
  venue: string;
  asset_class: string;
  auth_scheme: "hmac_sha256" | "eip712" | "ed25519";
  network?: string;
  notes?: string;
}

export const STATIC_VENUES: VenueEntry[] = [
  {
    venue: "binance",
    asset_class: "perp",
    auth_scheme: "hmac_sha256",
    notes:
      "Binance USD-M futures via REST. v0 limited to testnet until pilot " +
      "graduates. Symbol format: BTCUSDT (no slash).",
  },
  {
    venue: "okx",
    asset_class: "perp",
    auth_scheme: "hmac_sha256",
    notes:
      "OKX perpetual swap via REST. v0 limited to testnet. Symbol format: " +
      "BTC-USDT-SWAP.",
  },
  {
    venue: "asterdex",
    asset_class: "perp",
    auth_scheme: "eip712",
    network: "bsc",
    notes:
      "Asterdex on-chain perp. Uses Asterdex platform-controlled API wallet " +
      "(narrow per-asset caps enforced by Signer policy).",
  },
  {
    venue: "kucoin",
    asset_class: "perp",
    auth_scheme: "hmac_sha256",
    notes:
      "KuCoin Futures perp via REST. HMAC-SHA256 + KuCoin v2 encrypted " +
      "passphrase, all signed inside the enclave. Symbol format: XBTUSDTM " +
      "(KuCoin Futures contract code; qty is in contracts).",
  },
  {
    venue: "bybit",
    asset_class: "perp",
    auth_scheme: "hmac_sha256",
    notes:
      "Bybit V5 linear perp via REST (category=linear). Symbol format: " +
      "BTCUSDT (no slash).",
  },
  {
    venue: "hyperliquid_main",
    asset_class: "perp",
    auth_scheme: "eip712",
    network: "hyperliquid",
    notes:
      "Hyperliquid L1 perp. EIP-712 action signing (orders POST /exchange). " +
      "Symbol format: bare coin name, e.g. BTC. Account state is a public " +
      "read (POST /info clearinghouseState).",
  },
];
