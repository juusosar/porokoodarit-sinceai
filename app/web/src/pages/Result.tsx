import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { EvidenceTag } from "@/components/fit/FitCard";
import { PARTS } from "@/lib/parts";
import { useFit } from "@/lib/fit-store";
import { renderReason } from "@/lib/reasons";
import { cn } from "@/lib/utils";

// Order links are a stub until the Shopify product/variant mapping exists (POR-18 follow-up).
const SHOP_URL = import.meta.env.VITE_SHOP_URL ?? "https://takomogolf.com";

function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* no TTS on this browser */
  }
}

export function Result() {
  const { state, final: explanation, walkthrough, reset, loading } = useFit();

  useEffect(() => {
    if (state) walkthrough();
    // re-run whenever the fit changes (e.g. after a follow-up answer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) {
    return (
      <div className="space-y-4">
        <h1 className="text-4xl">Your fit</h1>
        <p className="text-muted-foreground">{loading ? "Working it out…" : "No fit yet."}</p>
        {!loading && (
          <Link to="/profile" className={buttonVariants()}>
            Start fitting
          </Link>
        )}
      </div>
    );
  }

  const sa = state.stock_advice;
  const heads = (state.head_options ?? []).filter((o) => o.probability >= 0.1).slice(0, 3);
  return (
    <div className="space-y-6">
      <h1 className="text-4xl">Your fit</h1>

      {explanation && (
        <div className="space-y-1 border-l-2 border-primary pl-3" data-testid="walkthrough">
          <p>{explanation.spoken_line}</p>
          <button className="text-xs text-primary underline" onClick={() => speak(explanation.spoken_line)}>
            Hear it
          </button>
        </div>
      )}

      {!state.buildable && (
        <p role="alert" className="border border-destructive p-2 text-sm">
          {state.warnings
            ?.filter((w) => w.code === "UNBUILDABLE")
            .map(renderReason)
            .join(" ")}
        </p>
      )}

      <ul className="divide-y divide-border border border-border bg-card">
        {PARTS.map(([key, name]) => {
          const p = state.parts[key];
          if (!p) return null;
          const why = explanation?.parts[key];
          return (
            <li key={key} className="space-y-1 p-3" data-testid={`result-${key}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs uppercase text-muted-foreground">{name}</span>
                <span className="text-xs text-muted-foreground">{Math.round(p.confidence * 100)}% sure</span>
              </div>
              <p className="font-display text-xl italic">{p.label}</p>
              <div className="flex flex-wrap gap-1">
                {(p.evidence ?? []).map((e) => (
                  <EvidenceTag key={e} source={e} />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {why ?? (p.reasons ?? []).slice(0, 2).map(renderReason).join(" ")}
              </p>
              {p.close_call && (
                <p className="text-sm">
                  <span className="text-primary">Close call:</span> {p.close_call.alternative} is a near second.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {heads.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-lg">Head shortlist</h2>
          {heads.map((o) => (
            <div key={o.head} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate">{o.head.toUpperCase().replace("-MKII", " MKII")}</span>
              <div className="h-2 flex-1 bg-muted">
                <div className="h-2 bg-primary" style={{ width: `${Math.round(o.probability * 100)}%` }} />
              </div>
              <span className="w-10 text-right text-muted-foreground">{Math.round(o.probability * 100)}%</span>
            </div>
          ))}
        </section>
      )}

      {sa && (
        <section className="space-y-2 border border-border p-3" data-testid="stock-advice">
          <h2 className="text-lg">Stock or custom?</h2>
          {sa.recommended === "stock" ? (
            <p className="text-sm">Stock fits you. Ships faster, and you get 30-day returns.</p>
          ) : (
            <>
              <p className="text-sm">
                Custom fits you best. Custom builds can't be returned.
                {sa.one_tweak_from_stock && " You're one tweak from stock:"}
              </p>
              <ul className="list-disc pl-5 text-sm">
                {(sa.blockers ?? []).map((b) => (
                  <li key={b.part}>{renderReason({ code: b.impact_code, params: b.params })}</li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={SHOP_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({
                  variant: sa.recommended === "custom" ? "default" : "outline",
                }),
              )}
            >
              {sa.recommended === "custom" ? "Build custom" : "Custom instead"}
            </a>
            <a
              href={SHOP_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({
                  variant: sa.recommended === "stock" ? "default" : "outline",
                }),
              )}
            >
              {sa.recommended === "stock" ? "Order stock" : "Order nearest stock"}
            </a>
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <Link to="/profile" className={buttonVariants({ variant: "outline" })}>
          Adjust answers
        </Link>
        <Button variant="ghost" onClick={reset}>
          Start over
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Saved on this device so you can come back. Start over clears it.</p>
    </div>
  );
}
