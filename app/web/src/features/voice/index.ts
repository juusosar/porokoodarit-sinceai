// Voice feature: host lines read aloud. Self-contained; the rest of the app only uses these exports.
// Toggle: VITE_VOICE=on|off (web) and TAKOMO_TTS_PROVIDER=elevenlabs|none (API).
export { voiceMode } from "./config";
export { useSpeakLine } from "./hooks";
export { HearItButton } from "./HearItButton";
export { VoiceToggle } from "./VoiceToggle";
export { lineOf } from "./line";
export { hostParagraphs, hostText, preloadHostLines, useHostLine, type HostLineId } from "./host-lines";
