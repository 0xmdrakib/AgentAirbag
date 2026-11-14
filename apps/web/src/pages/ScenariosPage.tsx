import { useEffect, useMemo, useState } from 'react';
import type { Law } from '@airbag/core';
import { LAW_SHORT } from '@airbag/core';
import { LAW_NAMES, SCENARIOS } from '../lib/report';
import scenarioYaml from '../generated/scenario-yaml.json';
import { Chip, CopyButton } from '../components/Primitives';
import { ArrowRightIcon, CodeIcon, SearchIcon, XIcon } from '../components/Icons';
import { cx } from '../lib/format';

const YAML = scenarioYaml as Record<string, string>;

function parseLaw(value: string | null | undefined): Law | 0 {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? (n as Law) : 0;
}

export function ScenariosPage({ lawParam }: { lawParam?: string | null }) {
  const [law, setLaw] = useState<Law | 0>(() => parseLaw(lawParam));

  useEffect(() => {
    setLaw(parseLaw(lawParam));
  }, [lawParam]);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SCENARIOS.filter((scenario) => {
      if (law !== 0 && scenario.law !== law) return false;
      if (!needle) return true;
      return `${scenario.id} ${scenario.title} ${scenario.story}`.toLowerCase().includes(needle);
    });
  }, [law, query]);

  const open = openId ? SCENARIOS.find((scenario) => scenario.id === openId) : undefined;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="page container page-scenarios">
      <div className="page-head">
        <div>
          <p className="eyebrow">Scenario library</p>
          <h1 className="h1">{SCENARIOS.length} crashes, 7 laws.</h1>
          <p className="page-sub">
            Each crash is one YAML file with a story, a fault, a judge rule and a fix. Add a new one
            in about twenty minutes; the build fails on an unknown key.
          </p>
        </div>
        <Chip tone="signal">
          {SCENARIOS.filter((scenario) => scenario.priority === 'P0').length} P0 ·{' '}
          {SCENARIOS.filter((scenario) => scenario.priority === 'P1').length} P1
        </Chip>
      </div>

      <div className="library-toolbar">
        <div className="filter-chips" role="group" aria-label="Filter by law">
          <button
            type="button"
            className={cx('filter-chip', law === 0 && 'filter-chip-active')}
            onClick={() => setLaw(0)}
            aria-pressed={law === 0}
          >
            All <span className="mono">{SCENARIOS.length}</span>
          </button>
          {([1, 2, 3, 4, 5, 6, 7] as Law[]).map((value) => (
            <button
              key={value}
              type="button"
              className={cx('filter-chip', law === value && 'filter-chip-active')}
              onClick={() => setLaw(value)}
              aria-pressed={law === value}
            >
              <span className="mono">L{value}</span>{' '}
              <span className="filter-label">{LAW_SHORT[value]}</span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <SearchIcon size={16} />
          <span className="sr-only">Search scenarios</span>
          <input
            type="search"
            placeholder="Search stories and ids"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="library-count mono">
        {filtered.length} of {SCENARIOS.length} crashes
      </div>

      <div className="library-grid">
        {filtered.map((scenario) => (
          <article className="library-card" key={scenario.id}>
            <div className="library-card-top">
              <span className="library-law">
                <span className="library-law-num mono">{scenario.law}</span>
                <span className="library-law-name">{LAW_NAMES[scenario.law as Law]}</span>
              </span>
            </div>
            <h2 className="h3">{scenario.title}</h2>
            <p className="library-story">{scenario.story}</p>
            <div className="library-tags">
              <span className={cx('library-priority mono', `priority-${scenario.priority.toLowerCase()}`)}>
                {scenario.priority}
              </span>
              {scenario.modeled && <span className="modeled-tag">modeled</span>}
              {scenario.llmSensitive && <span className="llm-tag">LLM-sensitive</span>}
              <span className="library-id mono">{scenario.id}</span>
            </div>
            <div className="library-actions">
              <a href={`#/replay/${scenario.id}`} className="library-watch">
                Watch Dummy crash <ArrowRightIcon size={14} />
              </a>
              <button type="button" className="library-yaml" onClick={() => setOpenId(scenario.id)}>
                <CodeIcon size={14} /> View YAML
              </button>
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="state-card">
          <span className="state-glyph">◇</span>
          <h2>No crashes match that filter.</h2>
          <p>Try a law chip or a shorter search.</p>
        </div>
      )}

      {open && (
        <div className="drawer-backdrop" onClick={() => setOpenId(null)} role="presentation">
          <div
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${open.title} YAML`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <p className="eyebrow">Scenario YAML</p>
                <h2 className="h3">{open.title}</h2>
              </div>
              <button
                type="button"
                className="drawer-close"
                onClick={() => setOpenId(null)}
                aria-label="Close YAML drawer"
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="drawer-actions">
              <CopyButton value={YAML[open.id] ?? ''} label="Copy YAML" />
              <span className="mono">{open.priority} · law {open.law}</span>
            </div>
            <pre className="drawer-code mono">
              <code>{YAML[open.id] ?? 'YAML not found.'}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
