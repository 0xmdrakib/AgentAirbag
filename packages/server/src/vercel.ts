import { createApiApp } from './api';

// Entry point for the Vercel function. scripts/build-api.ts bundles this file into api/index.js.
const app = createApiApp();

/**
 * vercel.json rewrites every /api/<path> to /api/index?__p=<path>, because one function file
 * cannot be matched by multi-segment paths on its own. Put the original path back before the
 * Hono router sees the request, and leave requests without the parameter untouched.
 */
const PATH_PARAM = '__p';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const forwarded = url.searchParams.get(PATH_PARAM);
    if (forwarded === null) return app.fetch(request);

    url.searchParams.delete(PATH_PARAM);
    url.pathname = `/api/${forwarded.replace(/^\/+/, '')}`;
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    return app.fetch(
      new Request(url, {
        method: request.method,
        headers: request.headers,
        body: hasBody ? await request.arrayBuffer() : undefined,
      }),
    );
  },
};
