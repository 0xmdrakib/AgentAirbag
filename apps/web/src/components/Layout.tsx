import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '../lib/format';
import { MarkerLogo } from './MarkerLogo';
import { MenuIcon, XIcon } from './Icons';

const NAV = [
  { href: '#/', label: 'Lab', path: '/' },
  { href: '#/run', label: 'Runner', path: '/run' },
  { href: '#/report', label: 'Report', path: '/report' },
  { href: '#/scenarios', label: 'Scenarios', path: '/scenarios' },
  { href: '#/connect', label: 'Connect', path: '/connect' },
];

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="container header-inner">
          <a href="#/" className="brand" aria-label="Airbag home">
            <MarkerLogo size={32} />
            <span className="wordmark">airbag</span>
          </a>
          <nav
            className={cx('nav', menuOpen && 'nav-open')}
            aria-label="Primary"
            id="primary-nav"
          >
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cx('nav-link', route === item.path && 'nav-active')}
                aria-current={route === item.path ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="header-right">
            {route !== '/run' && (
              <a href="#/run?auto=naive" className="btn btn-primary btn-sm header-cta">
                Run the suite
              </a>
            )}
            <button
              type="button"
              className="icon-button menu-button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="primary-nav"
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="app-main">
        {children}
      </main>
      <footer className="app-footer">
        <div className="container footer-grid">
          <div className="footer-brand-col">
            <div className="footer-brand">
              <MarkerLogo size={28} />
              <span className="wordmark">airbag</span>
            </div>
            <p className="footer-note">
              Crash-test dummies for AI agents that hold money. A fake NEAR Intents where agents can
              fail safely.
            </p>
          </div>
          <div className="footer-col">
            <p className="footer-title">Product</p>
            <a href="#/run">Suite runner</a>
            <a href="#/report">Report card</a>
            <a href="#/scenarios">21 crashes</a>
            <a href="#/connect">Bring your own agent</a>
          </div>
          <div className="footer-col">
            <p className="footer-title">Honesty</p>
            <span>Everything here is simulated</span>
            <span>No real funds move</span>
            <span>Modeled behavior is labelled</span>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>Built on NEAR</span>
          <span className="mono">MIT licensed</span>
        </div>
      </footer>
    </div>
  );
}
