import { useEffect, useRef, useState } from 'react';

export function ClubReveal({ image, name, compact = false }: { image: string | null; name: string; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`club-reveal ${compact ? 'club-reveal-compact' : ''} ${visible ? 'is-visible' : ''}`}>
    {image
      ? <img src={image} alt={`Takomo ${name} iron head`} className="club-cutout" />
      : <div role="img" aria-label={`Takomo ${name} iron`} className="flex aspect-[4/3] w-full items-center justify-center border border-border font-display text-3xl font-bold uppercase italic text-muted-foreground">{name}</div>}
  </div>;
}
