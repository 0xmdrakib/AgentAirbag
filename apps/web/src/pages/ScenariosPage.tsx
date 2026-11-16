import { useEffect, useMemo, useState } from 'react';
import type { Law } from '@airbag/core';
import { LAW_SHORT } from '@airbag/core';
import { LAW_NAMES, SCENARIOS } from '../lib/report';
import scenarioYaml from '../generated/scenario-yaml.json';
import { CopyButton, PageIntro } from '../components/Primitives';
import { ArrowRightIcon, CodeIcon, SearchIcon, XIcon } from '../components/Icons';
import { cx } from '../lib/format';
import '../styles/pages/scenarios.css';

const YAML = scenarioYaml as Record<string, string>;
const LAWS: Law[] = [1, 2, 3, 4, 5, 6, 7];

function parseLaw(value: string | null | undefined): Law | 0 {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? (n as Law) : 0;
}

/** 1 becomes "01", so the numbers line up down the list. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
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

  // The library number of a scenario never changes with the filter.
  const numbers = useMemo(() => new Map(SCENARIOS.map((scenario, i) => [scenario.id, i + 1])), []);

  const groups = useMemo(
    () =>
      LAWS.map((value) => ({
        law: value,
        items: filtered.filter((scenario) => scenario.law === value),
      })).filter((group) => group.items.length > 0),
    [filtered],
  );

  const open = openId ? SCENARIOS.find((scenario) => scenario.id === openId) : undefined;

  useEffect(() => {
    if (!open) return;
    const drawer = document.querySelector<HTMLElement>('.drawer');
    const heading = drawer?.querySelector<HTMLElement>('h2');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenId(null);
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      // Return focus to the card that opened the drawer.
      const trigger = document.querySelector<HTMLElement>(
        '[aria-expanded="true"][data-yaml-trigger]',
      );
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <div className="page page-lib">
      <PageIntro
        className="container lib-head"
        label="The library"
        title="Scenario library"
        body={`${SCENARIOS.length} crash scenarios across seven laws. Each is one YAML file with a story, the fault Airbag injects, the check the judge runs and a fix.`}
      />

      <div className="container lib-toolbar">
        <div className="lib-chips" role="group" aria-label="Filter by law">
          <button
            type="button"
            className={cx('lib-chip', law === 0 && 'is-on')}
            onClick={() => setLaw(0)}
            aria-pressed={law === 0}
          >
            All <span className="lib-chip-n">{SCENARIOS.length}</span>
          </button>
          {LAWS.map((value) => (
            <button
              key={value}
              type="button"
              className={cx('lib-chip', law === value && 'is-on')}
              onClick={() => setLaw(value)}
              aria-pressed={law === value}
            >
              <span className="lib-chip-n">L{value}</span> <span>{LAW_SHORT[value]}</span>
            </button>
          ))}
        </div>
        <label className="lib-search">
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

      <div className="container lib-count" aria-live="polite">
        {filtered.length} of {SCENARIOS.length} scenarios
      </div>

      <div className="container lib-groups">
        {groups.map((group) => (
          <section
            className="split lib-group"
            key={group.law}
            aria-labelledby={`lib-law-${group.law}`}
          >
            <div className="split-label">
              <p className="eyebrow">
                Law {group.law} · {group.items.length}{' '}
                {group.items.length === 1 ? 'scenario' : 'scenarios'}
              </p>
              <h2 className="lib-law" id={`lib-law-${group.law}`}>
                {LAW_NAMES[group.law]}
              </h2>
            </div>
            <ul className="rows lib-rows">
              {group.items.map((scenario) => (
                <li className="row-link lib-row" key={scenario.id}>
                  <span className="lib-num">{pad(numbers.get(scenario.id) ?? 0)}</span>
                  <div className="lib-body">
                    <h3 className="h3 lib-title">{scenario.title}</h3>
                    <p className="lib-story">{scenario.story}</p>
                    <p className="lib-flags">
                      <span className="lib-flag">{scenario.priority}</span>
                      {scenario.modeled && <span className="lib-flag">modeled</span>}
                      {scenario.llmSensitive && <span className="lib-flag">LLM</span>}
                    </p>
                  </div>
                  <div className="lib-actions">
                    <button
                      type="button"
                      className="lib-yaml"
                      aria-expanded={openId === scenario.id}
                      data-yaml-trigger
                      onClick={() => setOpenId(scenario.id)}
                    >
                      <CodeIcon size={14} /> View YAML
                    </button>
                    <a href={`/replay/${scenario.id}`} className="lib-watch">
                      Watch Dummy crash <ArrowRightIcon size={16} />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="container">
          <div className="callout lib-empty">
            <span className="tag">No match</span>
            <h2 className="h3">No crashes match that filter.</h2>
            <p>Try a law chip or a shorter search.</p>
          </div>
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
              <span className="mono">
                {open.priority} · Law {open.law}
              </span>
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
