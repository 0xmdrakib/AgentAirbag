import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/format';
import { MarkerLogo } from './MarkerLogo';
import { ArrowUpIcon, MenuIcon, XIcon } from './Icons';
import { WalletButton } from './WalletButton';

const NAV = [
  { href: '#/report', label: 'Report', path: '/report' },
  { href: '#/scenarios', label: 'Scenarios', path: '/scenarios' },
  { href: '#/connect', label: 'Test your agent', path: '/connect' },
];

export function Layout({ route, children }: { route: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
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
            <MarkerLogo size={28} />
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
            <a
              href={route === '/run' ? '#run-start' : '#/run'}
              className="btn btn-primary btn-sm header-cta"
            >
              {route === '/run' ? 'Start a run' : 'Run the suite'}
            </a>
            <WalletButton className="header-wallet" />
            <button
              type="button"
              ref={menuButton}
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
      <main id="main" className="app-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="app-footer">
        <div className="container footer-main">
          <div className="footer-brand-col">
            <a href="#/" className="footer-brand" aria-label="Airbag home">
              <MarkerLogo size={22} />
              <span className="wordmark">airbag</span>
            </a>
            <p className="footer-note">
              A crash-test lab for AI agents that move money. Everything here is simulated; no
              real funds move.
            </p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <a href="#/run">Run the suite</a>
            <a href="#/report">Report</a>
            <a href="#/scenarios">Scenarios</a>
            <a href="#/connect">Test your agent</a>
          </nav>
        </div>
        <div className="container footer-bottom">
          <span>Built on NEAR · MIT licensed</span>
          <a href="#main" className="to-top">
            Back to top <ArrowUpIcon size={14} />
          </a>
        </div>
      </footer>
    </div>
  );
}
