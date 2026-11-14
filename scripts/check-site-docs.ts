/**
 * After `pnpm build`: every published document must exist in apps/web/dist and be the real file,
 * not the app shell. Run by `pnpm verify`. With a URL argument it checks the live site instead:
 *   pnpm tsx scripts/check-site-docs.ts https://agentairbag.xyz/
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { GENERATED_SITE_FILES, PUBLISHED_FILES } from './site-files';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'apps', 'web', 'dist');
const files = [...PUBLISHED_FILES, ...GENERATED_SITE_FILES];
const live = process.argv[2];
const problems: string[] = [];

function looksLikeAppShell(text: string): boolean {
  return /^\s*<!doctype html/i.test(text);
}

for (const file of files) {
  let text: string;
  let type = '';
  if (live) {
    const response = await fetch(new URL(file, live));
    text = await response.text();
    type = response.headers.get('content-type') ?? '';
    if (response.status !== 200) problems.push(`${file}: HTTP ${response.status}`);
    if (!/text\/(plain|markdown|yaml)|application\/json/.test(type)) problems.push(`${file}: content type is "${type}"`);
  } else {
    const path = join(dist, file);
    if (!existsSync(path)) {
      problems.push(`${file}: missing from apps/web/dist`);
      continue;
    }
    text = readFileSync(path, 'utf8');
  }
  if (looksLikeAppShell(text)) problems.push(`${file}: returned the app shell, not the document`);
  if (text.trim().length < 20) problems.push(`${file}: is empty`);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`${files.length} published documents are served as real files${live ? ` by ${live}` : ' in the build'}.`);
