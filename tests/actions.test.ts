import { describe, it, expect, vi, beforeEach } from "vitest";
import signerPlugin from "../src/index.js";
import {
  __setClockForTests,
  __resetCacheForTests,
  signerAttestationProvider,
} from "../src/providers/attestation.js";

interface FakeRuntime {
  getSetting: (k: string) => string | undefined;
}

function runtimeWith(env: Record<string, string>): FakeRuntime {
  return {
    getSetting: (k: string) => env[k],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  __resetCacheForTests();
  vi.unstubAllGlobals();
});

describe("plugin shape", () => {
  it("default export is a Plugin", () => {
    expect(signerPlugin.name).toBe("@usenami/plugin-signer");
    expect(signerPlugin.description).toMatch(/Nitro Enclave/);
  });
  it("exposes 5 actions matching the v0 MCP tool set", () => {
    expect(signerPlugin.actions?.length).toBe(5);
    const names = signerPlugin.actions?.map((a) => a.name).sort();
    expect(names).toEqual([
      "CANCEL_SIGNER_ORDER",
      "GET_SIGNER_ACCOUNT",
      "GET_SIGNER_ATTESTATION",
      "LIST_SIGNER_VENUES",
      "PLACE_SIGNER_ORDER",
    ]);
  });
  it("exposes the attestation provider", () => {
    expect(signerPlugin.providers?.length).toBe(1);
    expect(signerPlugin.providers?.[0].name).toBe(
      "SIGNER_ATTESTATION_PROVIDER",
    );
  });
});

describe("GET_SIGNER_ATTESTATION action", () => {
  it("succeeds on a healthy gateway", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        pcr0_sha384: "c6eecf88aaa",
        registered_onchain: true,
        timestamp_ms: 1780000000000,
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const action = signerPlugin.actions!.find(
      (a) => a.name === "GET_SIGNER_ATTESTATION",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
    });
    let captured: { text?: string } | undefined;
    const result = await action.handler(
      runtime as never,
      {} as never,
      undefined,
      undefined,
      async (c) => {
        captured = c as { text?: string };
        return [];
      },
    );
    expect(result).toMatchObject({
      success: true,
      data: { pcr0_sha384: "c6eecf88aaa", registered_onchain: true },
    });
    expect(captured?.text).toMatch(/PCR0/);
  });

  it("returns error result on gateway failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("upstream down", { status: 502 }));
    vi.stubGlobal("fetch", fetchImpl);
    const action = signerPlugin.actions!.find(
      (a) => a.name === "GET_SIGNER_ATTESTATION",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
    });
    const result = await action.handler(
      runtime as never,
      {} as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({ success: false });
  });
});

describe("LIST_SIGNER_VENUES action", () => {
  it("returns all six venues without hitting the gateway", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const action = signerPlugin.actions!.find(
      (a) => a.name === "LIST_SIGNER_VENUES",
    )!;
    const result = await action.handler(
      runtimeWith({}) as never,
      {} as never,
      undefined,
      undefined,
      async () => [],
    );
    const venues = (result as { data?: { venues?: Array<{ venue: string }> } })
      .data?.venues;
    expect(venues).toHaveLength(6);
    const ids = (venues ?? []).map((v) => v.venue).sort();
    expect(ids).toEqual([
      "asterdex",
      "binance",
      "bybit",
      "hyperliquid_main",
      "kucoin",
      "okx",
    ]);
    // Every venue carries the three required manifest fields.
    for (const v of venues ?? []) {
      const entry = v as { venue: string; asset_class?: string; auth_scheme?: string };
      expect(typeof entry.venue).toBe("string");
      expect(typeof entry.asset_class).toBe("string");
      expect(["hmac_sha256", "eip712", "ed25519"]).toContain(entry.auth_scheme);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("place_order accepts the new venues (e.g. hyperliquid_main symbol BTC)", async () => {
    const signed = {
      venue: "hyperliquid_main",
      method: "POST",
      url: "https://api.hyperliquid.xyz/exchange",
      headers: {},
      body: "{}",
    };
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/sign/order")) return jsonResponse(signed);
      if (url.endsWith("/exchange")) return jsonResponse({ status: "ok" });
      return new Response("nope", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const action = signerPlugin.actions!.find(
      (a) => a.name === "PLACE_SIGNER_ORDER",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
      SIGNER_API_TOKEN: "tok",
    });
    const result = await action.handler(
      runtime as never,
      {
        content: {
          venue: "hyperliquid_main",
          symbol: "BTC",
          side: "buy",
          qty: 0.01,
          type: "market",
        },
      } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({
      success: true,
      data: { request: { venue: "hyperliquid_main", symbol: "BTC" } },
    });
  });
});

describe("GET_SIGNER_ACCOUNT action", () => {
  it("validate returns false without a token", async () => {
    const action = signerPlugin.actions!.find(
      (a) => a.name === "GET_SIGNER_ACCOUNT",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
    });
    expect(await action.validate(runtime as never, {} as never)).toBe(false);
  });

  it("rejects messages without venue", async () => {
    const action = signerPlugin.actions!.find(
      (a) => a.name === "GET_SIGNER_ACCOUNT",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
      SIGNER_API_TOKEN: "tok",
    });
    const result = await action.handler(
      runtime as never,
      { content: {} } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({ success: false });
  });

  it("submits signed bundle from gateway and returns venue response", async () => {
    const signedBundle = {
      balance: {
        venue: "okx",
        method: "GET",
        url: "https://okx.example.test/balance",
        headers: {},
      },
      positions: {
        venue: "okx",
        method: "GET",
        url: "https://okx.example.test/positions",
        headers: {},
      },
    };
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/account?venue=okx")) return jsonResponse(signedBundle);
      if (url.endsWith("/balance")) return jsonResponse({ equity: 145.32 });
      if (url.endsWith("/positions")) return jsonResponse({ positions: [] });
      return new Response("nope", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const action = signerPlugin.actions!.find(
      (a) => a.name === "GET_SIGNER_ACCOUNT",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
      SIGNER_API_TOKEN: "tok",
    });
    const result = await action.handler(
      runtime as never,
      { content: { venue: "okx" } } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        venue: "okx",
        response: {
          balance: { equity: 145.32 },
          positions: { positions: [] },
        },
      },
    });
  });
});

describe("PLACE_SIGNER_ORDER action", () => {
  it("rejects missing fields", async () => {
    const action = signerPlugin.actions!.find(
      (a) => a.name === "PLACE_SIGNER_ORDER",
    )!;
    const runtime = runtimeWith({ SIGNER_API_TOKEN: "tok" });
    const result = await action.handler(
      runtime as never,
      { content: { venue: "binance" } } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({ success: false });
  });

  it("rejects limit orders missing price", async () => {
    const action = signerPlugin.actions!.find(
      (a) => a.name === "PLACE_SIGNER_ORDER",
    )!;
    const runtime = runtimeWith({ SIGNER_API_TOKEN: "tok" });
    const result = await action.handler(
      runtime as never,
      {
        content: {
          venue: "binance",
          symbol: "BTCUSDT",
          side: "buy",
          qty: 0.001,
          type: "limit",
        },
      } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({
      success: false,
      error: /price required for limit/,
    });
  });

  it("submits signed order and surfaces venue response", async () => {
    const signed = {
      venue: "binance",
      method: "POST",
      url: "https://binance.example.test/order",
      headers: {},
      body: "side=BUY",
    };
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/sign/order")) return jsonResponse(signed);
      if (url.endsWith("/order"))
        return jsonResponse({ order_id: "42", status: "FILLED" });
      return new Response("nope", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const action = signerPlugin.actions!.find(
      (a) => a.name === "PLACE_SIGNER_ORDER",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
      SIGNER_API_TOKEN: "tok",
    });
    const result = await action.handler(
      runtime as never,
      {
        content: {
          venue: "binance",
          symbol: "BTCUSDT",
          side: "buy",
          qty: 0.001,
          type: "market",
        },
      } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({
      success: true,
      data: {
        request: { venue: "binance", symbol: "BTCUSDT" },
        response: { order_id: "42", status: "FILLED" },
      },
    });
  });
});

describe("CANCEL_SIGNER_ORDER action", () => {
  it("requires symbol for binance/okx", async () => {
    const action = signerPlugin.actions!.find(
      (a) => a.name === "CANCEL_SIGNER_ORDER",
    )!;
    const runtime = runtimeWith({ SIGNER_API_TOKEN: "tok" });
    const result = await action.handler(
      runtime as never,
      { content: { venue: "binance", order_id: "42" } } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({
      success: false,
      error: /symbol required for binance/,
    });
  });

  it("allows asterdex without symbol", async () => {
    const signed = {
      venue: "asterdex",
      method: "POST",
      url: "https://asterdex.example.test/cancel",
      headers: {},
      body: "{}",
    };
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/sign/cancel")) return jsonResponse(signed);
      if (url.endsWith("/cancel")) return jsonResponse({ cancelled: true });
      return new Response("nope", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchImpl);
    const action = signerPlugin.actions!.find(
      (a) => a.name === "CANCEL_SIGNER_ORDER",
    )!;
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
      SIGNER_API_TOKEN: "tok",
    });
    const result = await action.handler(
      runtime as never,
      {
        content: { venue: "asterdex", order_id: "0xdead" },
      } as never,
      undefined,
      undefined,
      async () => [],
    );
    expect(result).toMatchObject({
      success: true,
      data: { response: { cancelled: true } },
    });
  });
});

describe("SIGNER_ATTESTATION_PROVIDER", () => {
  it("hits the gateway on first call and surfaces PCR0", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        pcr0_sha384: "c6eecf88abcdef",
        registered_onchain: true,
        timestamp_ms: 1780000000000,
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
    });
    const result = await signerAttestationProvider.get(
      runtime as never,
      {} as never,
      {} as never,
    );
    expect(result.text).toMatch(/c6eecf88abcd/);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses cache for 60s, refetches after expiry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        pcr0_sha384: "c6eecf88abcdef",
        registered_onchain: true,
        timestamp_ms: 1780000000000,
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
    });
    let clock = 1_000;
    __setClockForTests(() => clock);
    await signerAttestationProvider.get(
      runtime as never,
      {} as never,
      {} as never,
    );
    clock += 30_000;
    await signerAttestationProvider.get(
      runtime as never,
      {} as never,
      {} as never,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
    clock += 60_000;
    await signerAttestationProvider.get(
      runtime as never,
      {} as never,
      {} as never,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns soft fallback on gateway failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchImpl);
    const runtime = runtimeWith({
      SIGNER_GATEWAY_URL: "https://signer.example.test",
    });
    const result = await signerAttestationProvider.get(
      runtime as never,
      {} as never,
      {} as never,
    );
    expect(result.text).toMatch(/unavailable/);
  });
});
