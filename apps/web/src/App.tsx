import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Layout } from './components/Layout';
import { AppStateProvider, useAppState } from './state/AppState';
import { decodeReport } from './lib/share';
import { LabPage } from './pages/LabPage';
import { RunnerPage } from './pages/RunnerPage';
import { ConnectPage } from './pages/ConnectPage';

// The replay trace and the scenario YAML are the two heavy pages; they load on first visit.
const ReportPage = lazy(() => import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })));
const ReplayPage = lazy(() => import('./pages/ReplayPage').then((m) => ({ default: m.ReplayPage })));
const ScenariosPage = lazy(() =>
  import('./pages/ScenariosPage').then((m) => ({ default: m.ScenariosPage })),
);
import { Toast } from './components/Toast';
import { useScrollReveal, useSectionSpy } from './components/Motion';

export interface RouteInfo {
  path: string;
  query: URLSearchParams;
  replayId?: string;
}

function readRoute(): RouteInfo {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?') as [string, string?];
  const path = pathPart || '/';
  if (path.startsWith('/replay/')) {
    return { path: '/replay', replayId: decodeURIComponent(path.slice('/replay/'.length)), query: new URLSearchParams(queryPart ?? '') };
  }
  return { path, query: new URLSearchParams(queryPart ?? '') };
}

function AppInner() {
  const [route, setRoute] = useState<RouteInfo>(readRoute);
  const { setShared, toast } = useAppState();
  useScrollReveal(route.path);
  useSectionSpy(route.path);

  useEffect(() => {
    const onHash = () => {
      const rawHash = window.location.hash.replace(/^#/, '');
      // In-page anchors (#main, #report-shape) are not routes. Scroll to them and keep the page.
      if (rawHash && !rawHash.startsWith('/')) {
        const target = document.getElementById(rawHash);
        if (target) {
          target.scrollIntoView({ block: 'start' });
          target.setAttribute('tabindex', '-1');
          (target as HTMLElement).focus({ preventScroll: true });
          return;
        }
      }
      const next = readRoute();
      setRoute(next);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const encoded = route.query.get('d');
    if (route.path === '/report' && encoded) {
      const report = decodeReport(encoded);
      if (report) setShared(report, false);
      else setShared(null, true);
    } else if (route.path !== '/report') {
      setShared(null, false);
    }
  }, [route, setShared]);

  useEffect(() => {
    const titles: Record<string, string> = {
      '/': 'Airbag — crash-test lab for AI agents that move money',
      '/run': 'Crash suite — Airbag',
      '/report': 'Report card — Airbag',
      '/replay': 'Crash replay — Airbag',
      '/scenarios': 'Scenario library — Airbag',
      '/connect': 'Connect your agent — Airbag',
    };
    document.title = titles[route.path] ?? titles['/']!;
  }, [route.path]);

  const page = useMemo(() => {
    switch (route.path) {
      case '/run':
        return <RunnerPage />;
      case '/report':
        return <ReportPage />;
      case '/replay':
        return <ReplayPage scenarioId={route.replayId} />;
      case '/scenarios':
        return <ScenariosPage lawParam={route.query.get('law')} />;
      case '/connect':
        return <ConnectPage />;
      case '/':
      default:
        return <LabPage />;
    }
  }, [route]);

  return (
    <Layout route={route.path}>
      <Suspense
        fallback={
          <div className="container page-loading" role="status" aria-live="polite">
            Loading…
          </div>
        }
      >
        {page}
      </Suspense>
      <Toast message={toast} />
    </Layout>
  );
}

export function App() {
  return (
    <AppStateProvider>
      <AppInner />
    </AppStateProvider>
  );
}
