import { describe, it, expect, vi } from "vitest";
import {
  callGateway,
  GatewayError,
  submitSignedBundle,
  submitSignedRequest,
  isSignedRequest,
} from "../src/gateway.js";

const baseCfg = {
  gatewayUrl: "https://signer.example.test",
  apiToken: "test-token",
  fetchTimeoutMs: 2000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("callGateway", () => {
  it("returns parsed JSON on 2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const out = await callGateway<{ ok: boolean }>(
      "/attestation",
      { method: "GET" },
      { ...baseCfg, fetchImpl },
    );
    expect(out).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe("https://signer.example.test/attestation");
    expect(call[1].headers.Authorization).toBe("Bearer test-token");
    expect(call[1].headers["User-Agent"]).toMatch(/@usenami\/plugin-signer@/);
  });

  it("throws GatewayError on non-2xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 503 }));
    await expect(
      callGateway("/x", { method: "GET" }, { ...baseCfg, fetchImpl }),
    ).rejects.toBeInstanceOf(GatewayError);
  });

  it("requires token when authRequired", async () => {
    const fetchImpl = vi.fn();
    await expect(
      callGateway(
        "/account",
        { method: "GET", authRequired: true },
        { ...baseCfg, apiToken: undefined, fetchImpl },
      ),
    ).rejects.toThrow(/SIGNER_API_TOKEN is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("strips trailing slashes from gatewayUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    await callGateway(
      "/attestation",
      { method: "GET" },
      {
        ...baseCfg,
        gatewayUrl: "https://signer.example.test///",
        fetchImpl,
      },
    );
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://signer.example.test/attestation",
    );
  });

  it("returns undefined for empty 200 body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    const out = await callGateway(
      "/x",
      { method: "GET" },
      { ...baseCfg, fetchImpl },
    );
    expect(out).toBeUndefined();
  });
});

describe("submitSignedBundle", () => {
  const reqA = {
    venue: "okx",
    method: "GET" as const,
    url: "https://okx.example.test/balance",
    headers: { "OK-ACCESS-KEY": "k" },
  };
  const reqB = {
    venue: "okx",
    method: "GET" as const,
    url: "https://okx.example.test/positions",
    headers: { "OK-ACCESS-KEY": "k" },
  };

  it("submits single SignedRequest and parses JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ equity: 145.32 }));
    const out = await submitSignedRequest(reqA, fetchImpl, 2000);
    expect(out).toEqual({ equity: 145.32 });
  });

  it("submits composite bundle in parallel and zips keys", async () => {
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/balance")) return jsonResponse({ equity: 145.32 });
      if (url.endsWith("/positions")) return jsonResponse({ positions: [] });
      return new Response("nope", { status: 500 });
    });
    const out = await submitSignedBundle(
      { balance: reqA, positions: reqB },
      fetchImpl,
      2000,
    );
    expect(out).toEqual({
      balance: { equity: 145.32 },
      positions: { positions: [] },
    });
  });

  it("rejects malformed composite", async () => {
    await expect(
      submitSignedBundle({ broken: { venue: "okx" } }, vi.fn(), 2000),
    ).rejects.toThrow(/not a SignedRequest/);
  });

  it("rejects non-object bundle", async () => {
    await expect(submitSignedBundle("garbage", vi.fn(), 2000)).rejects.toThrow(
      /Unexpected gateway response/,
    );
  });

  it("propagates venue 4xx with status + url", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("invalid signature", { status: 401 }));
    await expect(submitSignedRequest(reqA, fetchImpl, 2000)).rejects.toThrow(
      /okx GET .* failed \(401\): invalid signature/,
    );
  });
});

describe("isSignedRequest", () => {
  it("returns false for null", () => {
    expect(isSignedRequest(null)).toBe(false);
  });
  it("returns false for missing venue", () => {
    expect(
      isSignedRequest({
        method: "GET",
        url: "https://x.example",
        headers: {},
      }),
    ).toBe(false);
  });
  it("returns true for valid request", () => {
    expect(
      isSignedRequest({
        venue: "binance",
        method: "GET",
        url: "https://x.example",
        headers: {},
      }),
    ).toBe(true);
  });
});
