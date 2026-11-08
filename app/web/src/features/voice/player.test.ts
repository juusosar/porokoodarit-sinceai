import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeAudio = {
  src: string;
  play: ReturnType<typeof vi.fn>;
  pause: () => void;
  removeAttribute: (n: string) => void;
  getAttribute: (n: string) => string | null;
  load: () => void;
  preload?: string;
  addEventListener: (t: string, f: () => void) => void;
  fire: (t: string) => void;
};

let audios: FakeAudio[] = [];
let spoken: string[] = [];

beforeEach(() => {
  vi.resetModules();
  audios = [];
  spoken = [];
  localStorage.clear();
  window.__TAKOMO_ENV__ = { VITE_API_URL: "https://api.test" };
  vi.stubGlobal(
    "Audio",
    vi.fn(function (src?: string) {
      const h: Record<string, () => void> = {};
      const a: FakeAudio = {
        src: src ?? "",
        play: vi.fn(() => Promise.resolve()),
        pause: () => undefined,
        removeAttribute: () => {
          a.src = "";
        },
        getAttribute: () => a.src || null,
        load: () => undefined,
        addEventListener: (t, f) => (h[t] = f),
        fire: (t) => h[t]?.(),
      };
      audios.push(a);
      return a;
    }),
  );
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    vi.fn(function (t: string) {
      return { text: t };
    }),
  );
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak: (u: { text: string }) => spoken.push(u.text),
      cancel: () => undefined,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.__TAKOMO_ENV__ = {};
});

const load = () => import("./player");

describe("voice player", () => {
  it("streams a signed line from the API", async () => {
    const p = await load();
    p.speak({ text: "Hello golfer", token: "abc" });
    expect(audios).toHaveLength(1);
    expect(audios[0].src).toBe("https://api.test/v1/speak?text=Hello+golfer&token=abc");
    expect(spoken).toEqual([]);
  });

  it("never uses browser speech: silent without a token (even forced) and on audio error", async () => {
    const p = await load();
    p.speak({ text: "No token" });
    p.speak({ text: "No token" }, true);
    expect(audios.length + spoken.length).toBe(0);
    p.speak({ text: "Server down", token: "t" });
    expect(audios[0].preload).toBe("none");
    audios[0].fire("error");
    await new Promise((r) => setTimeout(r));
    expect(spoken).toEqual([]);
  });

  it("silent when the server audio cannot play", async () => {
    const p = await load();
    p.speak({ text: "Fails", token: "t" });
    audios[0].play.mockReturnValueOnce(Promise.reject(new Error("network")));
    p.speak({ text: "Fails2", token: "t" });
    await new Promise((r) => setTimeout(r));
    expect(spoken).toEqual([]);
  });

  it("reuses one element for every line (Safari/iOS unlock)", async () => {
    const p = await load();
    p.speak({ text: "One", token: "t" });
    p.speak({ text: "Two", token: "t" });
    expect(audios).toHaveLength(1);
    expect(audios[0].src).toContain("text=Two");
  });

  it("first tap primes the element with a silent clip", async () => {
    const p = await load();
    p.unlock();
    expect(audios).toHaveLength(1);
    expect(audios[0].src).toMatch(/^data:audio\/wav/);
    expect(audios[0].play).toHaveBeenCalled();
    expect(spoken).toEqual([]);
  });

  it("a line blocked before any tap plays on the first tap; failed unlock retries", async () => {
    const p = await load();
    const err = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    p.speak({ text: "Hi", token: "t" });
    const a = audios[0];
    a.play.mockReturnValueOnce(Promise.reject(err));
    p.unlock(); // gesture rejected: stays locked
    await new Promise((r) => setTimeout(r));
    expect(a.src).toContain("text=Hi"); // pending line kept, not replaced by silence
    p.unlock(); // next gesture plays the pending line
    expect(a.play).toHaveBeenCalledTimes(3);
    expect(a.src).toContain("text=Hi");
  });

  it("autoplay block stays quiet (no browser-voice fallback)", async () => {
    const p = await load();
    p.speak({ text: "Blocked", token: "t" });
    const err = Object.assign(new Error("blocked"), { name: "NotAllowedError" });
    audios[0].play.mockReturnValueOnce(Promise.reject(err));
    p.speak({ text: "Blocked2", token: "t" });
    await new Promise((r) => setTimeout(r));
    expect(spoken).toEqual([]);
  });

  it("stays quiet when muted unless forced, and remembers mute", async () => {
    const p = await load();
    p.setMuted(true);
    p.speak({ text: "x", token: "t" });
    expect(audios).toHaveLength(0);
    p.speak({ text: "x", token: "t" }, true);
    expect(audios).toHaveLength(1);
    const again = await (vi.resetModules(), load());
    expect(again.isMuted()).toBe(true);
  });

  it("VITE_VOICE=off silences everything; old =browser now means server voice", async () => {
    window.__TAKOMO_ENV__ = { VITE_VOICE: "off" };
    let p = await load();
    p.speak({ text: "x", token: "t" }, true);
    expect(audios.length + spoken.length).toBe(0);
    window.__TAKOMO_ENV__ = { VITE_VOICE: "browser" };
    vi.resetModules();
    p = await load();
    p.speak({ text: "y", token: "t" });
    expect(audios).toHaveLength(1);
    expect(spoken).toEqual([]);
  });
});
