import { existsSync } from 'node:fs';

export const PREVIEW_URL = process.env.AIRBAG_PREVIEW_URL ?? 'http://localhost:4321/';

/**
 * Local Chrome/Chromium for the manual UI checks. Override with CHROME_PATH.
 * These scripts are development tools, not part of the product runtime.
 */
export function chromePath(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) {
    throw new Error(
      'No Chrome/Chromium found. Set CHROME_PATH to the browser executable before running a UI check.',
    );
  }
  return found;
}
