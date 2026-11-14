import { describe, expect, it } from 'vitest';
import handler from '../src/vercel';

const ORIGIN = 'https://airbag.test';

describe('Vercel function entry', () => {
  it('serves a single-segment path as is', async () => {
    const response = await handler.fetch(new Request(`${ORIGIN}/api/health`));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
  });

  it('restores a multi-segment path from the rewrite parameter', async () => {
    const response = await handler.fetch(
      new Request(`${ORIGIN}/api/index?__p=auth/nonce`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ accountId: 'alice.near' }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { nonce?: string; message?: string };
    expect(typeof body.nonce).toBe('string');
    expect(body.message).toContain('alice.near');
  });

  it('keeps other query parameters and strips the rewrite parameter', async () => {
    const response = await handler.fetch(new Request(`${ORIGIN}/api/index?__p=health&x=1`));
    expect(response.status).toBe(200);
  });

  it('answers 404 JSON-or-text for an unknown API path, not the app shell', async () => {
    const response = await handler.fetch(new Request(`${ORIGIN}/api/index?__p=nope/nothing`));
    expect(response.status).toBe(404);
  });
});
