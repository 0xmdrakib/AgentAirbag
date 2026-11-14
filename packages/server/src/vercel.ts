import { createApiApp } from './api';

// Entry point for the Vercel function. scripts/build-api.ts bundles this file into api/[...path].js.
const app = createApiApp();

export default {
  fetch: (request: Request) => app.fetch(request),
};
