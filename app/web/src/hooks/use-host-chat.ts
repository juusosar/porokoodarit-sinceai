import { useCallback, useEffect, useRef, useState } from "react";
import { postChat } from "@/lib/api";
import type { Profile, UIMessage } from "@/lib/fitting-schema";
import type { Line } from "@/features/voice/player";

type Status = "ready" | "submitted" | "streaming" | "error";

const MAX_TURNS = 40; // API accepts 60; keep requests small
const MAX_TEXT = 2000;

function textOf(m: UIMessage) {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/** Id prefix of host lines written by the app when the API can't be reached. */
export const LOCAL_PREFIX = "local";
const OFFLINE_LINE = "Lost the signal for a sec, but I've got your answers. Let's keep going.";

export const FIX_TEXT = "No, something's off";

/**
 * Whether the Yes/No buttons belong under the chat (only asked after card 4): the host has replied
 * and that reply isn't the "which part is off?" answer to No. Not tied to "Did I get that right?"
 * in the text: an answer to the golfer's question has no confirm line, the buttons must stay anyway,
 * so the golfer is never left without a way forward. Hidden while a reply is pending.
 */
export function confirmPending(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return false;
  if (last.id.startsWith(LOCAL_PREFIX)) return true; // offline line: keep a way forward
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return !lastUser || !textOf(lastUser).trim().toLowerCase().startsWith(FIX_TEXT.toLowerCase());
}

let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Host chat over our API (POST /v1/chat), replacing the AI SDK's useChat + Lovable gateway.
 * Same surface the page used: messages, sendMessage({ text }), status, error.
 * The host's profile updates come back as tool-like message parts.
 */
export function useHostChat({ messages: initial, profile }: { messages: UIMessage[]; profile: () => Profile }) {
  const [messages, setMessages] = useState<UIMessage[]>(initial);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<Error | undefined>(undefined);
  // Newest host reply for the voice (not restored history, not offline lines).
  const [line, setLine] = useState<Line | null>(null);
  const latest = useRef(messages);
  latest.current = messages;
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const sendMessage = useCallback(
    ({ text, profile: override }: { text: string; profile?: Profile }) => {
      const user: UIMessage = { id: id("u"), role: "user", parts: [{ type: "text", text: text.slice(0, MAX_TEXT) }] };
      const history = [...latest.current, user];
      latest.current = history;
      setMessages(history);
      setStatus("submitted");
      setError(undefined);
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      const turns = history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", text: textOf(m).slice(0, MAX_TEXT) }))
        .filter((m) => m.text)
        .slice(-MAX_TURNS);
      postChat(turns, override ?? profile(), c.signal).then(
        (r) => {
          if (c.signal.aborted) return;
          const callId = id("call");
          const parts: UIMessage["parts"] = [];
          if (Object.keys(r.profile).length) parts.push({ type: "tool-update_profile", toolCallId: `${callId}-p`, input: r.profile });
          parts.push({ type: "text", text: r.reply });
          const next = [...latest.current, { id: id("a"), role: "assistant" as const, parts }];
          latest.current = next;
          setMessages(next);
          setLine({ text: r.reply, token: r.audio_token ?? null });
          setStatus("ready");
        },
        (e: unknown) => {
          if (c.signal.aborted) return;
          // Keep the cards moving: a local host line instead of a dead end (answers are already saved).
          const next = [...latest.current, { id: id(LOCAL_PREFIX), role: "assistant" as const, parts: [{ type: "text" as const, text: OFFLINE_LINE }] }];
          latest.current = next;
          setMessages(next);
          setError(e instanceof Error ? e : new Error(String(e)));
          setStatus("error");
        },
      );
    },
    [profile],
  );

  return { messages, sendMessage, status, error, line };
}
