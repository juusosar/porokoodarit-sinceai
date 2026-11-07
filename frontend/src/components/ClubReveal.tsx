import { useEffect, useRef, useState } from 'react';

export function ClubReveal({ image, name, compact = false }: { image: string; name: string; compact?: boolean }) {
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
    <img src={image} alt={`Takomo ${name} iron head`} className="club-cutout" />
  </div>;
}