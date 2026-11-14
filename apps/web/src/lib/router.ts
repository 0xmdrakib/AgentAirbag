/**
 * A tiny History API router. Routes are real paths (`/report`, `/replay/<id>`), so links look
 * clean and a static host only needs one rule: serve index.html for unknown paths.
 */

const NAVIGATE_EVENT = 'airbag:navigate';

/** Path plus query, without the in-page anchor. Used to tell a route change from an anchor jump. */
export function routeKey(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** Go to an in-app path such as `/report` or `/replay/amount-in-drift?x=1`. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const url = new URL(to, window.location.origin);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history[options.replace ? 'replaceState' : 'pushState'](null, '', next);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/** Notify on every navigation: links, back and forward, and anchor jumps. */
export function onNavigate(listener: () => void): () => void {
  window.addEventListener(NAVIGATE_EVENT, listener);
  window.addEventListener('popstate', listener);
  window.addEventListener('hashchange', listener);
  return () => {
    window.removeEventListener(NAVIGATE_EVENT, listener);
    window.removeEventListener('popstate', listener);
    window.removeEventListener('hashchange', listener);
  };
}

/** Turn a click on a plain `<a href="/path">` into a client-side navigation. */
function onLinkClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest('a');
  if (!anchor) return;
  if (anchor.target && anchor.target !== '_self') return;
  if (anchor.hasAttribute('download')) return;
  const href = anchor.getAttribute('href');
  if (!href || !href.startsWith('/') || href.startsWith('//')) return;
  event.preventDefault();
  navigate(href);
}

/** Install the link handler once. Returns a cleanup function. */
export function interceptLinks(): () => void {
  window.addEventListener('click', onLinkClick);
  return () => window.removeEventListener('click', onLinkClick);
}

/**
 * Early builds used `/#/report`. Rewrite such an address to the clean path so an old bookmark
 * still opens the right page.
 */
export function upgradeLegacyHash(): void {
  const match = /^#(\/.*)$/.exec(window.location.hash);
  if (match?.[1]) window.history.replaceState(null, '', match[1]);
}
