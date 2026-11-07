import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeAudio = {
  src: string;
  play: ReturnType<typeof vi.fn>;
  pause: () => void;
  removeAttribute: () => void;
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
    vi.fn((src: string) => {
      const h: Record<string, () => void> = {};
      const a: FakeAudio = {
        src,
        play: vi.fn(() => Promise.resolve()),
        pause: () => undefined,
        removeAttribute: () => undefined,
        addEventListener: (t, f) => (h[t] = f),
        fire: (t) => h[t]?.(),
      };
      audios.push(a);
      return a;
    }),
  );
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    vi.fn((t: string) => ({ text: t })),
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
    expect(audios[0].src).toBe(
      "https://api.test/v1/speak?text=Hello+golfer&token=abc",
    );
    expect(spoken).toEqual([]);
  });

  it("uses the browser voice without a token, and on audio error", async () => {
    const p = await load();
    p.speak({ text: "No token" });
    expect(audios).toHaveLength(0);
    expect(spoken).toEqual(["No token"]);
    p.speak({ text: "Server down", token: "t" });
    audios[0].fire("error");
    expect(spoken).toEqual(["No token", "Server down"]);
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

  it("VITE_VOICE=off silences everything, =browser skips the API", async () => {
    window.__TAKOMO_ENV__ = { VITE_VOICE: "off" };
    let p = await load();
    p.speak({ text: "x", token: "t" }, true);
    expect(audios.length + spoken.length).toBe(0);
    window.__TAKOMO_ENV__ = { VITE_VOICE: "browser" };
    vi.resetModules();
    p = await load();
    p.speak({ text: "y", token: "t" });
    expect(audios).toHaveLength(0);
    expect(spoken).toEqual(["y"]);
  });
});
