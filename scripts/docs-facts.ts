import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function run(command: string): void {
  console.log(`\n$ ${command}`);
  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm build:scenarios');
run('pnpm build:fixtures');
console.log(`\n${readFileSync('docs/FACTS.md', 'utf8')}`);
