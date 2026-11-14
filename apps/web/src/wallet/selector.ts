import './buffer-shim';
import type { NetworkId, WalletSelector } from '@near-wallet-selector/core';

interface ImportMetaEnv {
  VITE_NEAR_NETWORK?: string;
}

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;

/** Testnet is the safe default; set VITE_NEAR_NETWORK=mainnet for a mainnet build. */
export const nearNetwork: NetworkId = env?.VITE_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export interface WalletSetup {
  selector: WalletSelector;
  network: NetworkId;
}

let setup: Promise<WalletSetup> | null = null;

/**
 * One wallet selector per tab. The SDK and every wallet module are imported on first use,
 * so the landing page does not pay for them until someone connects.
 */
export function loadWallet(): Promise<WalletSetup> {
  if (!setup) {
    setup = Promise.all([
      import('@near-wallet-selector/core'),
      import('@near-wallet-selector/my-near-wallet'),
      import('@near-wallet-selector/sender'),
      import('@near-wallet-selector/okx-wallet'),
      import('@near-wallet-selector/nightly'),
      import('@near-wallet-selector/meteor-wallet'),
      import('@near-wallet-selector/here-wallet'),
      import('@near-wallet-selector/coin98-wallet'),
      import('@near-wallet-selector/ledger'),
      import('@near-wallet-selector/bitget-wallet'),
    ])
      .then(([core, myNearWallet, sender, okx, nightly, meteor, here, coin98, ledger, bitget]) =>
        core
          .setupWalletSelector({
            network: nearNetwork,
            modules: [
              myNearWallet.setupMyNearWallet(),
              sender.setupSender(),
              okx.setupOKXWallet(),
              nightly.setupNightly(),
              meteor.setupMeteorWallet(),
              here.setupHereWallet(),
              coin98.setupCoin98Wallet(),
              ledger.setupLedger(),
              bitget.setupBitgetWallet(),
            ],
          })
          .then((selector) => ({ selector, network: nearNetwork })),
      )
      .catch((error: unknown) => {
        setup = null;
        throw error;
      });
  }
  return setup;
}
