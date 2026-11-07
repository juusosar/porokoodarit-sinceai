import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { FitProvider, useFit } from "./fit-store";

const wrap = ({ children }: { children: ReactNode }) => <FitProvider>{children}</FitProvider>;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("reset during an in-flight fit clears loading and saved data", async () => {
  // fetch that never resolves until aborted
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_: string, init?: RequestInit) =>
        new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError")))),
    ),
  );
  const { result } = renderHook(() => useFit(), { wrapper: wrap });
  act(() => void result.current.commit("profile", { answers: { height_cm: 180 } }));
  expect(result.current.loading).toBe(true);
  expect(localStorage.getItem("takomo-fit-v1")).toContain("180");
  act(() => result.current.reset());
  expect(result.current.loading).toBe(false);
  expect(result.current.state).toBeNull();
  expect(localStorage.getItem("takomo-fit-v1")).toBeNull();
});

test("saved fitting older than 30 days is dropped", () => {
  localStorage.setItem(
    "takomo-fit-v1",
    JSON.stringify({ answers: { height_cm: 180 }, measurements: {}, savedAt: Date.now() - 31 * 24 * 3600 * 1000 }),
  );
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  const { result } = renderHook(() => useFit(), { wrapper: wrap });
  expect(result.current.answers).toEqual({});
  expect(localStorage.getItem("takomo-fit-v1")).toBeNull();
});
