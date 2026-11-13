import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const source = resolve(process.argv[2] ?? process.cwd());
const target = mkdtempSync(join(tmpdir(), 'airbag-clean-clone-'));
const repo = join(target, 'repo');

console.log(`Clean clone: ${source} -> ${repo}`);
execFileSync('git', ['clone', '--depth', '1', source, repo], { stdio: 'inherit' });

const run = (command) => {
  console.log(`\n$ ${command}`);
  execSync(command, { cwd: repo, stdio: 'inherit' });
};

run('pnpm install --frozen-lockfile');
run('pnpm demo --smoke');
console.log(`\nClean-clone test passed in ${repo}`);
