import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { scenarioFileSchema } from '../packages/core/src/scenario.schema';
import type { ScenarioDefinition } from '../packages/core/src/types';

const root = process.cwd();
const scenarioRoot = join(root, 'scenarios');
const outDir = join(root, 'packages/core/src/generated');
mkdirSync(outDir, { recursive: true });

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.yaml')) out.push(full);
  }
  return out;
}

const files = walk(scenarioRoot).sort();
const scenarios: ScenarioDefinition[] = [];
const yamlById: Record<string, string> = {};

for (const file of files) {
  const raw = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const parsed = scenarioFileSchema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    console.error(`Invalid scenario: ${relative(root, file)}`);
    console.error(parsed.error.issues);
    process.exit(1);
  }
  const scenario = parsed.data as unknown as ScenarioDefinition;
  if (scenarios.some((existing) => existing.id === scenario.id)) {
    console.error(`Duplicate scenario id: ${scenario.id}`);
    process.exit(1);
  }
  scenarios.push(scenario);
  yamlById[scenario.id] = raw;
}

scenarios.sort((a, b) => a.law - b.law || a.id.localeCompare(b.id));

writeFileSync(join(outDir, 'scenarios.json'), JSON.stringify(scenarios, null, 2));
writeFileSync(join(outDir, 'scenario-yaml.json'), JSON.stringify(yamlById, null, 2));

const byLaw = new Map<number, number>();
for (const scenario of scenarios) byLaw.set(scenario.law, (byLaw.get(scenario.law) ?? 0) + 1);
const p0 = scenarios.filter((scenario) => scenario.priority === 'P0').length;
const p1 = scenarios.filter((scenario) => scenario.priority === 'P1').length;

console.log(`Built ${scenarios.length} scenarios (${p0} P0, ${p1} P1)`);
for (const [law, count] of [...byLaw.entries()].sort(([a], [b]) => a - b)) {
  console.log(`  law ${law}: ${count}`);
}
if (scenarios.length < 15) {
  console.error('The definition of done requires at least 15 scenarios.');
  process.exit(1);
}
