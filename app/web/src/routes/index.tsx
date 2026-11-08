import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Star } from "lucide-react";
import { CARDS, QuickCard, type Answer } from "@/components/QuickCard";
import { BugsCard } from "@/components/BugsCard";
import { Button } from "@/components/ui/button";
import { useFitting } from "@/hooks/use-fitting";
import { saveFitting } from "@/lib/fitting.functions";
import { getFittingToken, startNewFitting } from "@/lib/fitting-session";
import type { FittingSnapshot, Profile, UIMessage } from "@/lib/fitting-schema";
import { FIX_TEXT, confirmPending, useHostChat } from "@/hooks/use-host-chat";
import { useChatPacing } from "@/hooks/use-chat-pacing";
import { useSpeakLine, VoiceToggle } from "@/features/voice";
import { HostMark } from '@/components/HostMark';

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Find My Fit with Gront | Takomo Golf" },
      { name: "description", content: "Chat with Gront, your AI club fitter. Build your golfer profile in minutes." },
      { property: "og:title", content: "Find My Fit with Gront | Takomo Golf" },
      { property: "og:description", content: "Chat with Gront, your AI club fitter. Build your golfer profile in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FIELDS: { key: string; label: string }[] = [
  { key: "hand", label: "Hand" },
  { key: "sex", label: "Sex" },
  { key: "rounds", label: "Rounds / year" },
  { key: "score", label: "Typical score" },
  { key: "carry", label: "7-iron carry" },
  { key: "development", label: "Development goal" },
  { key: "wants", label: "Priorities" },
  { key: "flight", label: "Ball flight" },
  { key: "tempo", label: "Tempo" },
  { key: "height", label: "Height" },
  { key: "wrist", label: "Wrist to floor" },
  { key: "glove", label: "Glove" },
];

const GREETING: UIMessage = {
  id: "greet",
  role: "assistant",
  parts: [{ type: "text", text: "Hey, Gront here. I'll fit you like I'm standing next to you on the range. Quick taps first, then we talk. Start with the basics:" }],
};

function Index() {
  const [started, setStarted] = useState(false);
  const [fresh, setFresh] = useState(false);
  const { snapshot, loading, error: loadError } = useFitting();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-display text-2xl font-bold italic tracking-wide">TAKOMO</span>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Find my fit · 1 / 4</span>
      </header>
      {started ? <Chat initial={fresh ? null : snapshot} /> : <Intro loading={loading} onStart={() => { startNewFitting(); setFresh(true); setStarted(true); }} onResume={!loading && !loadError && snapshot ? () => { setFresh(false); setStarted(true); } : undefined} />}
    </main>
  );
}

function Intro({ onStart, onResume, loading }: { onStart: () => void; onResume?: (() => void) | undefined; loading: boolean }) {
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 md:grid-cols-2 md:py-20">
      <div className="pointer-events-none absolute inset-0 bg-glow" />
      <div className="relative aspect-square overflow-hidden">
        <HostMark className="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-background/80 px-3 py-2 text-xs uppercase tracking-widest backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Gront is online
        </div>
      </div>
      <div data-scroll-reveal className="relative">
        <p className="text-xs uppercase tracking-widest text-primary">Your fitter, in your pocket</p>
        <h1 className="mt-3 font-display text-6xl font-bold uppercase italic leading-[0.9] md:text-7xl">
          Let's find <span className="text-primary">your fit.</span>
        </h1>
        <p className="mt-5 max-w-md text-lg text-muted-foreground">
          Chat with Gront for three minutes. He asks the questions a real fitter would, reads your carry the way a fitter does (most of us remember our best shot), and shows the evidence behind every part of your spec.
        </p>
        <Button
          disabled={loading}
          onClick={onStart}
          className="mt-8 inline-flex h-auto items-center gap-3 bg-primary px-10 py-4 font-display text-xl font-bold uppercase italic text-primary-foreground shadow-glow transition hover:brightness-110"
        >
          Start the fitting
        </Button>
        {onResume && <div><Button variant="link" className="mt-3 px-0 text-muted-foreground" onClick={onResume}>Continue saved fitting</Button></div>}
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-primary text-primary" /> 4.8 rating</span>
          <span>30-day returns</span>
          <span>2-year warranty</span>
        </div>
      </div>
    </section>
  );
}

function Chat({ initial }: { initial: FittingSnapshot | null }) {
  const profileRef = useRef<Profile>({});
  const getProfile = useCallback(() => profileRef.current, []);
  const { messages, sendMessage, status, error, line } = useHostChat({ messages: initial?.messages ?? [GREETING], profile: getProfile });
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [cardIdx, setCardIdx] = useState(initial?.cardIdx ?? 0);
  const [cardAnswers, setCardAnswers] = useState<Profile>(initial?.cardAnswers ?? {});
  const logRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const pacing = useChatPacing(messages, busy, initial?.messages);
  const [overrides, setOverrides] = useState<Profile>(initial?.overrides ?? {});
  const [resolved] = useState<Set<string>>(new Set(initial?.resolved)); // kept for saved-chat compatibility
  const save = saveFitting;
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [confirmed, setConfirmed] = useState(initial?.confirmed ?? false);
  useSpeakLine(line);

  const card = pacing.questionsReady ? CARDS[cardIdx] : undefined;

  const submitCard = (a: Record<string, Answer>) => {
    if (!card) return;
    setCardAnswers((p) => ({ ...p, ...a }));
    setCardIdx((i) => i + 1);
    const summary = card.questions.filter((q) => a[q.key]).map((q) => `${q.label}: ${a[q.key]?.value}`).join(", ");
    sendMessage({ text: `[Card ${card.id}: ${card.title}] ${summary}`, profile: { ...cardAnswers, ...profileRef.current, ...a } });
  };

  const profile = useMemo(() => {
    const p: Profile = { ...cardAnswers };
    for (const m of messages)
      for (const part of m.parts)
        if (part.type === "tool-update_profile")
          for (const [k, v] of Object.entries(part.input))
            if (v && typeof v === "object" && "value" in v) p[k] = v;
    return { ...p, ...overrides };
  }, [messages, cardAnswers, overrides]);
  profileRef.current = profile;

  const snapshot = useMemo<FittingSnapshot>(() => ({
    messages, cardIdx, cardAnswers, overrides, profile, resolved: [...resolved], confirmed,
  }), [messages, cardIdx, cardAnswers, overrides, profile, resolved, confirmed]);

  const persist = (value: FittingSnapshot) => {
    const queued = saveQueue.current.catch(() => undefined).then(() => save({ data: { token: getFittingToken(), snapshot: JSON.stringify(value) } }));
    saveQueue.current = queued;
    return queued;
  };

  useEffect(() => {
    if (busy || saving) return;
    const timer = setTimeout(() => {
      void persist(snapshot).then(() => setSaveError(false)).catch(() => setSaveError(true));
    }, 300);
    return () => clearTimeout(timer);
  }, [snapshot, busy, saving]);

  const proceed = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await persist({ ...snapshot, confirmed: true });
      setConfirmed(true);
      await navigate({ to: "/swing" });
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, card, pacing.visibleText(messages.at(-1) ?? GREETING), pacing.questionsReady]);

  const submit = () => {
    const t = input.trim();
    if (!t || pacing.presenting) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <section className="mx-auto max-w-4xl px-3 py-3 sm:px-6 sm:py-6">
      <div className="flex h-[calc(100dvh-104px)] min-h-[440px] flex-col bg-background/60 sm:h-[calc(100dvh-124px)]">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
          <Avatar speaking={pacing.presenting} />
          <div className="flex-1">
            <p className="font-display text-2xl font-bold uppercase italic leading-none">Gront Harvot</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />{pacing.presenting ? status === "streaming" ? "Gront is replying…" : "Giving that some thought…" : "Your game. Your fit."}</p>
          </div>
          <span className="hidden font-display text-lg uppercase italic text-muted-foreground sm:block">Let's talk golf.</span>
          <VoiceToggle />
        </div>

        <ol aria-label="Profiling progress" className="grid grid-cols-4 gap-2 border-b border-border px-4 pb-4 sm:px-6">
          {["Basics", "Your game", "Measurements", "Priorities"].map((label, i) => <li key={label} aria-current={i === Math.min(cardIdx, 3) ? "step" : undefined} className={`min-w-0 border-t-2 pt-2 ${cardIdx > i ? "border-primary text-foreground" : cardIdx === i ? "border-primary text-primary" : "border-border text-muted-foreground"}`}><span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs">{cardIdx > i ? <Check className="size-3 shrink-0" /> : <span className="font-display">0{i + 1}</span>}<span className="break-words">{label}</span></span></li>)}
        </ol>

        <div ref={logRef} className="chat-log min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
          {messages.map((m) => {
            const text = pacing.visibleText(m);
            const activeReply = m.role === "assistant" && m.id === messages.at(-1)?.id;
            if (!text && !(activeReply && pacing.presenting)) return null;
            const cardMsg = text.match(/^\[(?:Card \d+|Recheck): ([^\]]+)\] (.*)$/); // Recheck: old saved chats
            if (m.role === "user" && cardMsg)
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[90%] border-r-2 border-primary bg-secondary/70 px-4 py-3 text-sm text-foreground sm:max-w-[80%]">
                    <p className="mb-1 flex items-center gap-2 font-display font-bold uppercase italic text-primary"><Check className="size-3" />{cardMsg[1]}</p>
                    <p className="text-muted-foreground">{cardMsg[2]}</p>
                  </div>
                </div>
              );
            return m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] border-r-2 border-primary bg-secondary/70 px-4 py-3 text-sm text-foreground">{text}</p>
              </div>
            ) : (
              <div key={activeReply ? "active-reply" : m.id} className="flex items-start gap-3" data-host-reply={activeReply ? "active" : "saved"}>
                <Avatar small />
                {text ? <p className="max-w-[85%] whitespace-pre-line pt-1 text-base leading-relaxed">{text}<span className={activeReply && pacing.presenting ? "chat-cursor" : "hidden"} aria-hidden="true" /></p> : <ThinkingDots />}
              </div>
            );
          })}
          {pacing.presenting && messages.at(-1)?.role !== "assistant" && (
            <div key="active-reply" className="flex items-start gap-3" data-host-reply="active">
              <Avatar small />
              <ThinkingDots />
            </div>
          )}
          {card && <QuickCard key={card.id} card={card} onSubmit={submitCard} />}
          {pacing.questionsReady && cardIdx === CARDS.length && (
            <BugsCard
              score={profile['score']?.value ?? ''}
              carryYd={/\d/.test(profile['carry']?.value ?? '') ? parseFloat(profile['carry']?.value ?? '') : null}
              onSubmit={(picked, extra) => {
                setCardIdx((i) => i + 1);
                const parts = [...picked, ...(extra ? [`"${extra}"`] : [])].join(", ");
                sendMessage({ text: `[Card 4: What bugs you] ${parts}` });
              }}
            />
          )}
          {pacing.questionsReady && cardIdx > CARDS.length && (() => {
            if (!confirmPending(messages)) return null;
            return (
              <div data-scroll-reveal className="flex gap-2 pl-11">
                <Button type="button" disabled={saving} onClick={proceed} className="h-auto whitespace-normal rounded-none px-5 py-2.5 font-display text-sm font-bold uppercase italic tracking-wide">{saving ? "Saving…" : "Yes, let's continue"}</Button>
                <Button type="button" variant="outline" disabled={saving} onClick={() => { setConfirmed(false); sendMessage({ text: FIX_TEXT }); }} className="h-auto rounded-none px-5 py-2.5 font-display text-sm font-bold uppercase italic tracking-wide">No</Button>
              </div>
            );
          })()}
          {error && <p role="status" className="text-sm text-destructive">Gront couldn't reach the fitting service just now. Your answers are saved; keep going or try again in a moment.</p>}
          {saveError && <p role="alert" className="text-sm text-destructive">Couldn't save your fitting. Your answers are still here; please try again before continuing.</p>}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex items-end gap-2 border-t border-border bg-background/80 p-3 sm:p-4"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={1}
            placeholder="Tell Gront about your game…"
            aria-label="Message Gront"
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
          <Button type="submit" disabled={pacing.presenting || !input.trim()} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center bg-primary text-primary-foreground transition disabled:opacity-40">
            <ArrowUp className="h-5 w-5" />
          </Button>
        </form>
      </div>

    </section>
  );
}

function ThinkingDots() {
  return <span className="flex h-9 items-center gap-1" aria-label="Gront is thinking">
    {[0, 1, 2].map(i => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 120}ms` }} />)}
  </span>;
}

function Avatar({ speaking, small }: { speaking?: boolean; small?: boolean }) {
  const size = small ? "h-9 w-9" : "h-12 w-12";
  return (
    <div className="relative shrink-0">
      {speaking && <span className="absolute -inset-1 animate-pulse rounded-full border border-primary/50" />}
      <HostMark className={`relative ${size} rounded-full border-2 border-primary`} />
    </div>
  );
}
