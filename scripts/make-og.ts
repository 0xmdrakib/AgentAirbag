/**
 * Renders apps/web/public/og.png (1200x630), the social preview image, from an HTML card.
 * X, Slack and most link unfurlers ignore SVG, so the committed asset is a PNG.
 * Run: pnpm og
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromePath } from './preview';

const root = resolve(import.meta.dirname, '..');
const fontFile = (name: string) =>
  readFileSync(resolve(root, 'apps/web/node_modules/@fontsource-variable', name)).toString('base64');

const inter = fontFile('inter/files/inter-latin-wght-normal.woff2');
const mono = fontFile('jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Inter'; font-weight: 100 900; src: url(data:font/woff2;base64,${inter}) format('woff2'); }
@font-face { font-family: 'JB'; font-weight: 100 800; src: url(data:font/woff2;base64,${mono}) format('woff2'); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #fafaf9; font-family: Inter, sans-serif; color: #121212; position: relative; overflow: hidden; }
.frame { position: absolute; inset: 28px; border: 1px solid #d3d2cd; border-radius: 18px; padding: 52px 60px; background: #fff; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 650; letter-spacing: -0.03em; }
.brand .agent { font-weight: 450; color: #6b6b67; }
h1 { margin-top: 64px; font-size: 64px; line-height: 1.06; font-weight: 680; letter-spacing: -0.04em; max-width: 640px; }
h1 mark { background: linear-gradient(transparent 62%, #ffd21f 62%); color: inherit; }
.sub { margin-top: 30px; font-family: JB, monospace; font-size: 22px; color: #484846; }
.foot { position: absolute; left: 60px; right: 60px; bottom: 46px; display: flex; justify-content: space-between; align-items: center; font-family: JB, monospace; font-size: 20px; color: #6b6b67; }
.cards { position: absolute; right: 60px; top: 130px; display: flex; flex-direction: column; gap: 16px; width: 360px; }
.card { border: 1px solid #e6e5e1; border-radius: 14px; padding: 22px 24px; background: #fafaf9; }
.card .who { font-size: 18px; color: #6b6b67; font-weight: 500; }
.card .row { display: flex; align-items: center; gap: 22px; margin-top: 10px; }
.grade { font-size: 64px; line-height: 1; font-weight: 700; letter-spacing: -0.05em; }
.f { color: #c01f31; } .a { color: #0d7a4e; }
.card .stat { font-family: JB, monospace; font-size: 16px; white-space: nowrap; color: #484846; line-height: 1.4; }
</style></head><body>
<div class="frame">
  <div class="brand">
    <svg width="40" height="40" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#0F1114" stroke="#FFD21F" stroke-width="2"/><path d="M32 32 L32 2 A30 30 0 0 1 62 32 Z" fill="#FFD21F"/><path d="M32 32 L32 62 A30 30 0 0 1 2 32 Z" fill="#FFD21F"/><path d="M32 32 L62 32 A30 30 0 0 1 32 62 Z" fill="#2E3541"/><path d="M32 32 L2 32 A30 30 0 0 1 32 2 Z" fill="#2E3541"/><circle cx="32" cy="32" r="3" fill="#0F1114" stroke="#FFD21F" stroke-width="1.5"/></svg>
    <span><span class="agent">agent</span> airbag</span>
  </div>
  <h1>Crash-test your AI agent <mark>before</mark> it touches real money.</h1>
  <div class="sub">21 crashes · 7 laws · 0 real dollars</div>
  <div class="cards">
    <div class="card"><div class="who">Dummy (no guards)</div><div class="row"><span class="grade f">F</span><span class="stat">21 of 21 crashed<br>$10,907.04 simulated loss</span></div></div>
    <div class="card"><div class="who">Seatbelt (Guard)</div><div class="row"><span class="grade a">A</span><span class="stat">21 of 21 survived<br>$1.00 modeled fee</span></div></div>
  </div>
  <div class="foot"><span>agentairbag.xyz</span><span>Simulation · no real funds</span></div>
</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
writeFileSync(resolve(root, 'apps/web/public/og.png'), png);
await browser.close();
console.log(`Wrote apps/web/public/og.png (${png.length} bytes)`);
