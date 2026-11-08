import { voiceMode } from "./config";
import { speak, type Line } from "./player";

/** Replay a line on demand, also when muted. */
export function HearItButton({
  line,
  className,
}: {
  line: Line;
  className?: string;
}) {
  if (voiceMode() === "off" || !line.token) return null; // nothing to play without the server voice
  return (
    <button
      type="button"
      className={className}
      onClick={() => speak(line, true)}
    >
      Hear it
    </button>
  );
}
