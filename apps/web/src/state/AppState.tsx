import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { runSuite, type RunReport, type ScenarioResult } from '@airbag/core';
import { naiveAgent, hardenedAgent } from '@airbag/agents';
import generated from '../generated/reports.json';
import { SCENARIOS } from '../lib/report';

export type AgentId = 'naive' | 'hardened';

interface AppStateValue {
  reports: Record<AgentId, RunReport>;
  activeAgent: AgentId;
  activeReport: RunReport;
  setActiveAgent: (agent: AgentId) => void;
  running: AgentId | null;
  progress: { done: number; total: number; last?: ScenarioResult };
  liveResults: Partial<Record<AgentId, ScenarioResult[]>>;
  runAgent: (agent: AgentId) => Promise<RunReport>;
  sharedReport: RunReport | null;
  shareError: boolean;
  setShared: (report: RunReport | null, error?: boolean) => void;
  toast: string | null;
  showToast: (message: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const initialReports: Record<AgentId, RunReport> = {
  naive: generated.naive as RunReport,
  hardened: generated.hardened as RunReport,
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<Record<AgentId, RunReport>>(initialReports);
  const [activeAgent, setActiveAgent] = useState<AgentId>('naive');
  const [running, setRunning] = useState<AgentId | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; last?: ScenarioResult }>({
    done: 0,
    total: SCENARIOS.length,
  });
  const [liveResults, setLiveResults] = useState<Partial<Record<AgentId, ScenarioResult[]>>>({});
  const [sharedReport, setSharedReport] = useState<RunReport | null>(null);
  const [shareError, setShareError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const runAgent = useCallback(
    async (agentId: AgentId) => {
      setRunning(agentId);
      setActiveAgent(agentId);
      setLiveResults((previous) => ({ ...previous, [agentId]: [] }));
      setProgress({ done: 0, total: SCENARIOS.length });
      const results: ScenarioResult[] = [];
      const report = await runSuite({
        agent: agentId === 'naive' ? naiveAgent() : hardenedAgent(),
        scenarios: SCENARIOS,
        seed: generated.seed,
        onResult: (result) => {
          results.push(result);
          setProgress({ done: results.length, total: SCENARIOS.length, last: result });
          setLiveResults((previous) => ({ ...previous, [agentId]: [...results] }));
        },
      });
      setReports((previous) => ({ ...previous, [agentId]: report }));
      setRunning(null);
      return report;
    },
    [],
  );

  const setShared = useCallback((report: RunReport | null, error = false) => {
    setSharedReport(report);
    setShareError(error);
  }, []);

  const value = useMemo<AppStateValue>(() => {
    const activeReport = sharedReport ?? reports[activeAgent];
    return {
      reports,
      activeAgent,
      activeReport,
      setActiveAgent,
      running,
      progress,
      liveResults,
      runAgent,
      sharedReport,
      shareError,
      setShared,
      toast,
      showToast,
    };
  }, [
    reports,
    activeAgent,
    running,
    progress,
    liveResults,
    runAgent,
    sharedReport,
    shareError,
    setShared,
    toast,
    showToast,
  ]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside AppStateProvider');
  return value;
}
