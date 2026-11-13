#!/usr/bin/env node
/**
 * A minimal bring-your-own agent for the Airbag process adapter.
 * It follows the 1Click-shaped contract, sends its deposit through the sandbox
 * wallet, trusts the server's virtual clock, and posts a final claim.
 *
 * Usage: pnpm airbag run --cmd "node examples/http-agent.mjs"
 */
const base = process.env.AIRBAG_BASE_URL ?? process.env.ONECLICK_BASE_URL;
if (!base) {
  console.error('AIRBAG_BASE_URL is not set');
  process.exit(2);
}
const task = JSON.parse(process.env.AIRBAG_TASK ?? '{}');

async function json(path, init) {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

const post = (path, body) =>
  json(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const tokens = await json('/v0/tokens');
const origin = tokens.find((token) => token.assetId === task.originAssetId);
const destination = tokens.find((token) => token.assetId === task.destinationAssetId);
if (!origin || !destination) throw new Error('Task tokens are missing from the list');

const amount = BigInt(Math.round(Number(task.amount) * 10 ** origin.decimals)).toString();
const quote = await post('/v0/quote', {
  dry: false,
  depositMode: 'SIMPLE',
  swapType: 'EXACT_INPUT',
  slippageTolerance: task.maxSlippageBps ?? 100,
  originAsset: origin.assetId,
  destinationAsset: destination.assetId,
  depositType: 'ORIGIN_CHAIN',
  amount,
  refundTo: task.refundTo,
  refundType: task.refundType ?? 'ORIGIN_CHAIN',
  recipient: task.recipient,
  recipientType: 'DESTINATION_CHAIN',
  deadline: new Date(Date.UTC(2026, 10, 14, 23, 59, 0)).toISOString(),
});

const depositAddress = quote.quote.depositAddress;
const transfer = await post('/sandbox/v0/wallet/transfer', {
  from: task.refundTo,
  to: depositAddress,
  assetId: origin.assetId,
  amount: quote.quote.amountIn,
  ...(quote.quote.depositMemo ? { memo: quote.quote.depositMemo } : {}),
});
await post('/v0/deposit/submit', { txHash: transfer.txHash, depositAddress });

let status;
for (let attempt = 0; attempt < 10; attempt += 1) {
  status = await json(`/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
    headers: { 'x-airbag-advance-ms': '25000' },
  });
  if (['SUCCESS', 'REFUNDED', 'FAILED', 'INCOMPLETE_DEPOSIT'].includes(status.status)) break;
}

const outcome =
  status?.status === 'SUCCESS'
    ? 'success'
    : status?.status === 'REFUNDED'
      ? 'refunded'
      : status?.status === 'FAILED'
        ? 'failed'
        : 'pending';

await post('/sandbox/v0/report', {
  outcome,
  message: `Sample agent observed ${status?.status ?? 'no status'}.`,
  ...(status?.swapDetails?.amountOut ? { amountOut: status.swapDetails.amountOut } : {}),
  ...(status?.swapDetails?.destinationChainTxHashes
    ? { txHashes: status.swapDetails.destinationChainTxHashes.map((tx) => tx.hash) }
    : {}),
});
