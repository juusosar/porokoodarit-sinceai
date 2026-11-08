/**
 * Host picture: Takomo wordmark tile instead of a real person's photo (Gront Harvot is a made-up host).
 * Drawn as one SVG so it scales from chat avatar to intro hero. Swap for the official logo file when we have it.
 */
export function HostMark({ className = '', label = 'Takomo logo' }: { className?: string; label?: string }) {
  return <svg role="img" aria-label={label} viewBox="0 0 100 100" className={className} preserveAspectRatio="xMidYMid slice">
    <rect width={100} height={100} fill="#0b0b0b" />
    <text x={50} y={56} textAnchor="middle" className="font-display" fontSize={26} fontWeight={700} fontStyle="italic" letterSpacing={0.5} textLength={68} lengthAdjust="spacingAndGlyphs" fill="#ffffff">TAKOMO</text>
    <rect x={22} y={63} width={56} height={4} fill="#FF6E01" />
  </svg>;
}
