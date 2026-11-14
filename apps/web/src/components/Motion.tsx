import { useEffect } from 'react';

function prefersReduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const FAILSAFE_MS = 2500;

/**
 * Scroll reveal. Content is visible by default; only once this hook runs does the document get
 * `reveal-ready`, which allows the hidden start state. So a page with no JavaScript, or one whose
 * observers never fire, still shows everything. There is also a 2.5s failsafe that reveals any
 * element still waiting (for example after a jump inside the page). Off for reduced motion.
 */
export function useScrollReveal(routeKey: string) {
  useEffect(() => {
    const root = document.documentElement;
    if (prefersReduced() || typeof IntersectionObserver === 'undefined') {
      root.classList.remove('reveal-ready');
      return undefined;
    }

    let observer: IntersectionObserver | null = null;
    const seen = new WeakSet<Element>();
    const pending = new Set<Element>();

    const reveal = (node: Element) => {
      node.classList.add('is-revealed');
      pending.delete(node);
      observer?.unobserve(node);
    };

    const attach = () => {
      observer ??= new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) reveal(entry.target);
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
      );
      for (const node of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
        if (seen.has(node)) continue;
        seen.add(node);
        if (node.getBoundingClientRect().top < window.innerHeight * 0.92) {
          reveal(node);
        } else {
          pending.add(node);
          observer.observe(node);
        }
      }
    };

    root.classList.add('reveal-ready');
    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(document.getElementById('main') ?? document.body, {
      childList: true,
      subtree: true,
    });
    const failsafe = window.setTimeout(() => {
      for (const node of pending) reveal(node);
    }, FAILSAFE_MS);

    return () => {
      window.clearTimeout(failsafe);
      observer?.disconnect();
      mutations.disconnect();
      root.classList.remove('reveal-ready');
    };
  }, [routeKey]);
}

/** Highlights the in-page nav item for the section currently on screen. */
export function useSectionSpy(routeKey: string) {
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-section-link]'));
    if (links.length === 0 || typeof IntersectionObserver === 'undefined') return undefined;
    const targets = links
      .map((link) => document.getElementById(link.dataset.sectionLink ?? ''))
      .filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const link of links) {
            const current = link.dataset.sectionLink === entry.target.id;
            link.classList.toggle('section-nav-active', current);
            if (current) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
          }
        }
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [routeKey]);
}
