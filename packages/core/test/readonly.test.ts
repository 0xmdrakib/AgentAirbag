import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

describe('read-only live client', () => {
  it('contains the real 1Click host in exactly one source file', () => {
    const files = walk('.')
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !file.includes('node_modules'))
      .filter((file) => !file.includes('artifacts'))
      .filter((file) => !/[\\/]test[\\/]/.test(file));
    const hits = files.filter((file) =>
      readFileSync(file, 'utf8').includes('1click.chaindefuser.com'),
    );
    expect(hits.map((file) => relative('.', file))).toEqual([
      join('packages', 'server', 'src', 'liveProbe.ts'),
    ]);
  });

  it('exposes only GET /v0/tokens and POST /v0/quote with dry:true', () => {
    const source = readFileSync(join('packages', 'server', 'src', 'liveProbe.ts'), 'utf8');
    const endpoints = [...source.matchAll(/\/v0\/[a-z/]+/g)].map((match) => match[0]);
    expect([...new Set(endpoints)].sort()).toEqual(['/v0/quote', '/v0/tokens']);
    expect(source).toContain("request.dry !== true");
    expect(source).not.toContain('/v0/deposit');
    expect(source).not.toContain('/v0/status');
    expect(source).not.toContain('dry: false');
  });

  it('never sends a token in the sandbox default path', () => {
    const source = readFileSync(join('packages', 'server', 'src', 'liveProbe.ts'), 'utf8');
    expect(source).not.toContain('Authorization: `Bearer');
  });
});
