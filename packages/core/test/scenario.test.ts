import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { SCENARIOS, scenarioFileSchema } from '../src/index';

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith('.yaml')) files.push(full);
  }
  return files;
}

describe('scenario contract', () => {
  it('ships 21 scenarios, three per law, split 12 P0 and 9 P1', () => {
    expect(SCENARIOS).toHaveLength(21);
    for (const law of [1, 2, 3, 4, 5, 6, 7]) {
      expect(SCENARIOS.filter((scenario) => scenario.law === law)).toHaveLength(3);
    }
    expect(SCENARIOS.filter((scenario) => scenario.priority === 'P0')).toHaveLength(12);
    expect(SCENARIOS.filter((scenario) => scenario.priority === 'P1')).toHaveLength(9);
  });

  it('gives every scenario a unique id, a story and a fix key', () => {
    const ids = new Set<string>();
    for (const scenario of SCENARIOS) {
      expect(scenario.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(scenario.id)).toBe(false);
      ids.add(scenario.id);
      expect(scenario.title.length).toBeGreaterThan(5);
      expect(scenario.story.length).toBeGreaterThan(20);
      expect(scenario.fix.key.length).toBeGreaterThan(2);
    }
  });

  it('validates every YAML source with the Zod schema', () => {
    const files = walk('scenarios');
    expect(files).toHaveLength(SCENARIOS.length);
    const ids: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const parsed = scenarioFileSchema.safeParse(parse(raw));
      expect(parsed.success, `${file}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      if (parsed.success) ids.push(parsed.data.id);
    }
    expect(ids.sort()).toEqual(SCENARIOS.map((scenario) => scenario.id).sort());
  });
});
