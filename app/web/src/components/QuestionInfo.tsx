import { Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const reasons: Record<string, string> = {
  hand: 'So we look at the right-handed or left-handed options for you. No guessing which side of the ball you stand on.',
  sex: 'Optional. Female golfers are offered Takomo’s ladies builds (lighter graphite shafts, length adjusted to match). Your carry, measurements and game still matter more; skipping is fine.',
  loft: 'Lofts differ by brand, so two “7-irons” fly different distances. Your loft (on the maker’s spec page) lets us read your carry more fairly. Skip if unsure.',
  rounds: 'How often you play gives context to your experience and goals. It doesn’t measure your skill or decide a club on its own.',
  score: 'Your usual score helps put forgiveness and control in perspective. We pair it with your priorities, not judge your game by one number.',
  carry: 'Your normal 7-iron carry gives a rough starting point for distance and shaft discussions. Loft and strike affect it, so it isn’t a verified swing-speed measurement.',
  development: 'We want the comparison to reflect where you want to take your game. Your outlook isn’t a prediction of future ability or speed.',
  flight: 'Your usual ball height adds context to launch preferences. It isn’t a measured launch angle, and it’s fine not to know.',
  height: 'Together with wrist-to-floor distance, height adds context for club length. It doesn’t establish length or lie on its own; the fitting rules still need validation.',
  wrist: 'The distance from your wrist to the floor adds arm-length context alongside your height. This is self-reported geometry, not a dynamic lie measurement.',
  glove: 'Glove size offers a rough clue for grip sizing. It isn’t a hand measurement or a confirmed grip recommendation.',
  wants: 'Your misses and frustrations tell us what matters most: forgiveness, distance, feel or control. Clubs can support your game, but they won’t fix a swing on their own.',
  trackman: 'Session numbers can add context beyond estimates. Link import isn’t connected yet; manually entered numbers stay labelled as self-reported.',
  club: 'Different clubs produce different numbers. We keep another club’s data separate so it doesn’t get mistaken for your 7-iron results.',
  speed: 'Clubhead speed helps inform shaft-flex discussions. Your entered speed is self-reported, and a validated shaft match is still needed.',
  launch: 'Launch angle adds context to how the ball leaves the club. It is not an attack-angle measurement or a confirmed head recommendation.',
  spin: 'Spin adds context to flight and stopping power. Strike, ball and conditions also affect it, so it can’t decide your fitting alone.',
  impact: 'Your usual strike location adds context to mishits. Heel or toe contact alone doesn’t tell us your lie angle or justify an automatic adjustment.',
};

export function QuestionInfo({ field, label, variant = 'popover' }: { field: string; label: string; variant?: 'tooltip' | 'popover' }) {
  const [open, setOpen] = useState(false);
  const reason = reasons[field];
  if (!reason) return null;
  if (variant === 'tooltip') return <TooltipProvider delayDuration={200}><Tooltip open={open} onOpenChange={setOpen}><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Why we ask: ${label}`} onClick={() => setOpen(true)} className="size-7 shrink-0 text-muted-foreground hover:text-primary"><Info className="size-3.5" /></Button></TooltipTrigger><TooltipContent side="top" sideOffset={8} className="max-w-[min(300px,calc(100vw-32px))] rounded-none border border-border bg-popover p-3 text-sm leading-relaxed text-popover-foreground"><p className="mb-1 font-display font-bold uppercase italic text-primary">Why we ask</p>{reason}</TooltipContent></Tooltip></TooltipProvider>;
  return <div className="mt-2"><Popover><PopoverTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Why we ask: ${label}`} title="Why we ask" className="size-8 text-muted-foreground"><Info className="size-4" /></Button></PopoverTrigger><PopoverContent align="start" side="bottom" className="max-w-[calc(100vw-32px)]"><p className="font-display text-lg font-bold uppercase italic text-primary">Why we ask</p><p className="mt-2 text-sm leading-relaxed">{reason}</p></PopoverContent></Popover></div>;
}