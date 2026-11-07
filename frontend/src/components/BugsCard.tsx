import { useState } from "react";
import { QuestionInfo } from '@/components/QuestionInfo';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { asksBallFlight } from '@/components/QuickCard';

export const REPLACE_CLUBS = 'Grandpa’s clubs have earned retirement';
export function showShotDetails(score: string, carryYd: number | null) {
  return asksBallFlight(score, carryYd);
}

export const BUGS = [
  "Slice / shots leak right",
  "Hook / pulls left",
  "Thin or topped shots",
  "Fat shots",
  "Can't get the ball up",
  "Lose distance on mishits",
  "Inconsistent distances",
  "Clubs feel harsh",
];

export function BugsCard({ onSubmit, score = '', carryYd = null }: { onSubmit: (picked: string[], text: string) => void; score?: string; carryYd?: number | null }) {
  const advanced = showShotDetails(score, carryYd);
  const [details, setDetails] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const toggle = (b: string) => setPicked((p) => (p.includes(b) ? p.filter((x) => x !== b) : [...p, b]));
  const ready = picked.length > 0 || text.trim().length > 0;

  return (
    <div data-scroll-reveal className="chat-question ml-0 border-l-2 border-primary bg-card/70 p-5 sm:ml-12 sm:p-6">
      <div className="flex items-center gap-2"><p className="font-display text-2xl font-bold uppercase italic">What bugs you?</p><QuestionInfo field="wants" label="What bugs you?" variant="tooltip" /></div>
      <p className="mt-1 text-sm text-muted-foreground">Pick all that sound like your game.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[REPLACE_CLUBS, 'Clubs feel harsh'].map(b => <Button key={b} type="button" variant={picked.includes(b) ? 'default' : 'secondary'} aria-pressed={picked.includes(b)} onClick={() => toggle(b)} className="h-auto max-w-full whitespace-normal px-3 py-1.5 text-left text-sm">{b}</Button>)}
      </div>
      {!advanced && <Button type="button" variant="ghost" aria-expanded={details} aria-controls="shot-problems" onClick={() => setDetails(value => !value)} className="mt-3 h-auto w-full justify-between gap-2 whitespace-normal px-0 text-sm">My shots bug me too <ChevronDown className={`size-4 shrink-0 ${details ? 'rotate-180' : ''}`} /></Button>}
      <div id="shot-problems" hidden={!advanced && !details} className="mt-3 flex flex-wrap gap-1.5">
        {BUGS.filter(b => b !== 'Clubs feel harsh').map((b) => (
          <Button
            key={b}
            type="button"
            variant={picked.includes(b) ? 'default' : 'secondary'}
            aria-pressed={picked.includes(b)}
            onClick={() => toggle(b)}
            className="h-auto max-w-full whitespace-normal px-3 py-1.5 text-sm"
          >
            {b}
          </Button>
        ))}
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Something else? Write it here"
        className="mt-3 w-full bg-secondary px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
      <Button
        disabled={!ready}
        onClick={() => onSubmit(picked, text.trim())}
        className="mt-4 w-full bg-primary py-3 font-display text-lg font-bold uppercase italic text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
      >
        That's my game
      </Button>
    </div>
  );
}
