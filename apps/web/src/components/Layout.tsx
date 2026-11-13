import type { ReactNode } from 'react';
import { cx } from '../lib/format';
import { MarkerLogo } from './MarkerLogo';
import { SimBanner } from './Primitives';

const NAV = [
  { href: '#/', label: 'Lab', path: '/' },
  { href: '#/run', label: 'Runner', path: '/run' },
  { href: '#/report', label: 'Report', path: '/report' },
  { href: '#/scenarios', label: 'Scenarios', path: '/scenarios' },
  { href: '#/connect', label: 'Connect', path: '/connect' },
];

export function Layout({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <div className="container header-inner">
          <a href="#/" className="brand" aria-label="Airbag home">
            <MarkerLogo size={30} />
            <span className="wordmark">airbag</span>
          </a>
          <nav className="nav" aria-label="Primary">
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
            <SimBanner compact />
          </div>
        </div>
      </header>
      <main id="main" className="app-main">
        {children}
      </main>
      <footer className="app-footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <MarkerLogo size={24} />
            <span className="wordmark wordmark-sm">airbag</span>
          </div>
          <p className="footer-note">
            Crash-test dummies for AI agents that hold money. Everything on this site is simulated.
          </p>
          <div className="footer-links">
            <a href="#/scenarios">21 crashes</a>
            <a href="#/connect">Bring your own agent</a>
            <span>Built at NEAR HACKATHON</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
