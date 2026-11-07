import { useEffect } from 'react';

/** Reveal only blocks that start below the viewport; never delay their availability. */
export function ScrollReveal() {
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const registered = new Set<Element>();
    const reveal = (element: Element) => {
      element.classList.remove('scroll-reveal-pending');
      observer.unobserve(element);
    };
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    const discover = () => {
      document.querySelectorAll('[data-scroll-reveal]').forEach(element => {
        if (registered.has(element) || !element.getClientRects().length) return;
        registered.add(element);
        if (motion.matches || element.getBoundingClientRect().top < window.innerHeight) return;
        element.classList.add('scroll-reveal-pending');
        observer.observe(element);
      });
    };
    const mutations = new MutationObserver(discover);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element) {
        const element = event.target.closest('[data-scroll-reveal]');
        if (element) reveal(element);
      }
    };
    const reduceMotion = () => { if (motion.matches) registered.forEach(reveal); };
    document.addEventListener('focusin', focus);
    motion.addEventListener('change', reduceMotion);
    discover();
    return () => {
      mutations.disconnect(); observer.disconnect();
      document.removeEventListener('focusin', focus);
      motion.removeEventListener('change', reduceMotion);
      registered.forEach(element => element.classList.remove('scroll-reveal-pending'));
    };
  }, []);
  return null;
}