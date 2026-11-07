import { useCallback, useEffect, useRef, useState } from "react";
import { postChat } from "@/lib/api";
import type { Profile, UIMessage } from "@/lib/fitting-schema";

type Status = "ready" | "submitted" | "streaming" | "error";

const MAX_TURNS = 40; // API accepts 60; keep requests small
const MAX_TEXT = 2000;

function textOf(m: UIMessage) {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Host chat over our API (POST /v1/chat), replacing the AI SDK's useChat + Lovable gateway.
 * Same surface the page used: messages, sendMessage({ text }), status, error.
 * The host's profile updates and recheck requests come back as tool-like message parts.
 */
export function useHostChat({ messages: initial, profile }: { messages: UIMessage[]; profile: () => Profile }) {
  const [messages, setMessages] = useState<UIMessage[]>(initial);
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<Error | undefined>(undefined);
  const latest = useRef(messages);
  latest.current = messages;
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const sendMessage = useCallback(
    ({ text }: { text: string }) => {
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
      postChat(turns, profile(), c.signal).then(
        (r) => {
          if (c.signal.aborted) return;
          const callId = id("call");
          const parts: UIMessage["parts"] = [];
          if (Object.keys(r.profile).length) parts.push({ type: "tool-update_profile", toolCallId: `${callId}-p`, input: r.profile });
          if (r.recheck) parts.push({ type: "tool-ask_recheck", toolCallId: `${callId}-r`, input: r.recheck });
          parts.push({ type: "text", text: r.reply });
          const next = [...latest.current, { id: id("a"), role: "assistant" as const, parts }];
          latest.current = next;
          setMessages(next);
          setStatus("ready");
        },
        (e: unknown) => {
          if (c.signal.aborted) return;
          setError(e instanceof Error ? e : new Error(String(e)));
          setStatus("error");
        },
      );
    },
    [profile],
  );

  return { messages, sendMessage, status, error };
}
