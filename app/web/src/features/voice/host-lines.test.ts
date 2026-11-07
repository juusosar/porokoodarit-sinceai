import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  window.__TAKOMO_ENV__ = { VITE_API_URL: "https://api.test" };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__TAKOMO_ENV__;
});

describe("fixed host lines", () => {
  it("speaks paragraphs joined, matching what the API signs", async () => {
    const { hostText, hostParagraphs } = await import("./host-lines");
    expect(hostParagraphs("enrichment_intro")).toHaveLength(2);
    expect(hostText("enrichment_intro")).toBe(hostParagraphs("enrichment_intro").join(" "));
  });

  it("fetches tokens once per visit", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ tokens: { swing_intro: "a".repeat(32) } }))));
    vi.stubGlobal("fetch", fetch);
    const { loadTokens } = await import("./host-lines");
    expect((await loadTokens()).swing_intro).toBe("a".repeat(32));
    await loadTokens();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.test/v1/voice/lines");
  });

  it("no server voice = no tokens (silent, Hear it still works in the browser voice)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 404 }))));
    const { loadTokens } = await import("./host-lines");
    expect(await loadTokens()).toEqual({});
  });

  it("server errors are retried on the next screen", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response("", { status: 503 })));
    vi.stubGlobal("fetch", fetch);
    const { loadTokens } = await import("./host-lines");
    expect(await loadTokens()).toEqual({});
    await loadTokens();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("voice off makes no request", async () => {
    window.__TAKOMO_ENV__ = { VITE_VOICE: "off" };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { loadTokens } = await import("./host-lines");
    expect(await loadTokens()).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
