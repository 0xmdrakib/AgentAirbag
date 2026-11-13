import {
  BASE_USDC,
  NEAR_WNEAR,
  USER_WALLET,
} from '@airbag/core';
import { startServer } from '@airbag/server';

const server = await startServer({ port: 4334 });
const base = `http://localhost:${server.port}/r/demo`;

try {
  const tokens = (await (await fetch(`${base}/v0/tokens`)).json()) as unknown[];
  if (!Array.isArray(tokens) || tokens.length < 2) throw new Error('Token list missing');

  const quoteResponse = await fetch(`${base}/v0/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dry: false,
      depositMode: 'SIMPLE',
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: BASE_USDC,
      destinationAsset: NEAR_WNEAR,
      depositType: 'ORIGIN_CHAIN',
      amount: '100000000',
      refundTo: USER_WALLET,
      refundType: 'ORIGIN_CHAIN',
      recipient: 'alice.near',
      recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(Date.UTC(2026, 10, 14, 23, 59, 0)).toISOString(),
    }),
  });
  if (!quoteResponse.ok) throw new Error(`Quote failed with ${quoteResponse.status}`);
  const quote = (await quoteResponse.json()) as {
    quote: { depositAddress: string; amountIn: string };
    quoteRequest: { originAsset: string };
  };
  if (!quote.quote.depositAddress) throw new Error('No deposit address');

  const transferResponse = await fetch(`${base}/sandbox/v0/wallet/transfer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      from: USER_WALLET,
      to: quote.quote.depositAddress,
      assetId: quote.quoteRequest.originAsset,
      amount: quote.quote.amountIn,
    }),
  });
  if (!transferResponse.ok) throw new Error(`Transfer failed with ${transferResponse.status}`);
  const transfer = (await transferResponse.json()) as { txHash: string };

  const submitResponse = await fetch(`${base}/v0/deposit/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      txHash: transfer.txHash,
      depositAddress: quote.quote.depositAddress,
    }),
  });
  if (!submitResponse.ok) throw new Error(`Submit failed with ${submitResponse.status}`);

  const statusResponse = await fetch(
    `${base}/v0/status?depositAddress=${encodeURIComponent(quote.quote.depositAddress)}`,
    { headers: { 'x-airbag-advance-ms': '25000' } },
  );
  if (!statusResponse.ok) throw new Error(`Status failed with ${statusResponse.status}`);
  const status = (await statusResponse.json()) as {
    status: string;
    swapDetails: { destinationChainTxHashes: { hash: string }[]; amountOut: string };
  };
  if (status.status !== 'SUCCESS') throw new Error(`Expected SUCCESS, got ${status.status}`);
  if (status.swapDetails.destinationChainTxHashes.length === 0) {
    throw new Error('SUCCESS had no destination hash');
  }

  const reportResponse = await fetch(`${base}/sandbox/v0/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      outcome: 'success',
      message: 'HTTP smoke test',
      amountOut: status.swapDetails.amountOut,
      txHashes: status.swapDetails.destinationChainTxHashes.map((tx) => tx.hash),
    }),
  });
  if (!reportResponse.ok) throw new Error(`Report failed with ${reportResponse.status}`);

  console.log(
    `HTTP sandbox smoke passed on port ${server.port}: ${tokens.length} tokens, quote, transfer, submit, SUCCESS, report.`,
  );
} finally {
  server.close();
}
