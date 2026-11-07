import { voiceMode } from "./config";
import { useMuted } from "./hooks";
import { setMuted } from "./player";

/** Header mute switch. Choice is remembered on this device. */
export function VoiceToggle() {
  const muted = useMuted();
  if (voiceMode() === "off") return null;
  return (
    <button
      type="button"
      className="min-h-11 underline"
      aria-pressed={!muted}
      onClick={() => setMuted(!muted)}
      data-testid="voice-toggle"
    >
      {muted ? "Voice off" : "Voice on"}
    </button>
  );
}
