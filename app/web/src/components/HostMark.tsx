import type { CSSProperties } from 'react';

const LOGOS = {
  /** Mark + TAKOMO, stacked (320x266). */
  full: { src: '/brand/takomo-logo.png', ratio: 320 / 266 },
  /** TAKOMO letters only (320x47). */
  wordmark: { src: '/brand/takomo-wordmark.png', ratio: 320 / 47 },
} as const;

/**
 * Official Takomo logo as a CSS mask, so it takes the text colour (currentColor) on any theme.
 * Size it with a height class; width follows the logo's aspect ratio.
 */
export function TakomoLogo({ variant = 'wordmark', className = '', label = 'Takomo' }: { variant?: keyof typeof LOGOS; className?: string; label?: string }) {
  const { src, ratio } = LOGOS[variant];
  const mask = `url(${src}) center / contain no-repeat`;
  const style: CSSProperties = { aspectRatio: ratio, WebkitMask: mask, mask };
  return <span {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} className={`inline-block bg-current ${className}`} style={style} />;
}

/** Host picture: Takomo logo on a dark tile instead of a real person's photo (Gront Harvot is a made-up host). */
export function HostMark({ className = '', label = 'Takomo logo' }: { className?: string; label?: string }) {
  return <div role="img" aria-label={label} className={`flex items-center justify-center overflow-hidden bg-[#0b0b0b] text-white ${className}`}>
    <TakomoLogo variant="full" label="" className="h-[55%] max-h-56 max-w-[78%]" />
  </div>;
}
