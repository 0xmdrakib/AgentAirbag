/**
 * The documents published on the website next to the app, so that
 * https://agentairbag.xyz/llms.txt and friends return the real file.
 * Each entry is a repository path that is served at the same path on the site.
 */
export const SITE_ORIGIN = 'https://agentairbag.xyz/';

export const PUBLISHED_FILES: string[] = [
  'llms.txt',
  'llms-full.txt',
  'AGENTS.md',
  'README.md',
  'DECISIONS.md',
  'BUILD_LOG.md',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/SCENARIOS.md',
  'docs/CLAIMS.md',
  'docs/FACTS.md',
  'docs/VERIFIED_FACTS.md',
  'docs/DEPLOY.md',
  'docs/SECURITY.md',
  'docs/DESIGN.md',
  'docs/DEMO_SCRIPT.md',
  'docs/HACKATHON.md',
  'docs/MASTER_PROMPT.md',
  'fixtures/report.naive.json',
  'fixtures/report.hardened.json',
  'examples/http-agent.mjs',
];

/** Files the site build generates instead of copying one to one. */
export const GENERATED_SITE_FILES: string[] = ['data/scenarios.yaml'];
