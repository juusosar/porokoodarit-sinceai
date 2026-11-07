import { useEffect, useSyncExternalStore } from "react";
import { isMuted, speak, stop, subscribe, type Line } from "./player";
import { voiceMode } from "./config";

export function useMuted(): boolean {
  return useSyncExternalStore(subscribe, isMuted, isMuted);
}

/** Speak each new line once it arrives; stop when it goes away or the screen unmounts. */
export function useSpeakLine(line: Line | null | undefined): void {
  const text = line?.text ?? "";
  const token = line?.token ?? null;
  useEffect(() => {
    if (!text || voiceMode() === "off") return;
    speak({ text, token });
    return stop;
  }, [text, token]);
}
