import './buffer-shim';
import '@near-wallet-selector/modal-ui/styles.css';
import type { NetworkId, WalletSelector } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';

interface ImportMetaEnv {
  VITE_NEAR_NETWORK?: string;
}

const env = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;

/** Testnet is the safe default; set VITE_NEAR_NETWORK=mainnet for a mainnet build. */
export const nearNetwork: NetworkId = env?.VITE_NEAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

export interface WalletSetup {
  selector: WalletSelector;
  modal: WalletSelectorModal;
  network: NetworkId;
}

let setup: Promise<WalletSetup> | null = null;

/**
 * One wallet selector per tab. setupWalletSelector refuses a second instance by default,
 * and a module-level promise also keeps React StrictMode's double effect from racing.
 *
 * The selector, modal and wallet module are imported on first use so the landing page does
 * not pay for the wallet SDK until someone actually connects.
 */
export function loadWallet(): Promise<WalletSetup> {
  if (!setup) {
    setup = Promise.all([
      import('@near-wallet-selector/core'),
      import('@near-wallet-selector/modal-ui'),
      import('@near-wallet-selector/my-near-wallet'),
      import('@near-wallet-selector/sender'),
      import('@near-wallet-selector/okx-wallet'),
      import('@near-wallet-selector/bitget-wallet'),
      import('@near-wallet-selector/nightly'),
    ])
      .then(([core, modalUi, myNearWallet, sender, okx, bitget, nightly]) =>
        core
          .setupWalletSelector({
            network: nearNetwork,
            modules: [
              myNearWallet.setupMyNearWallet(),
              sender.setupSender(),
              okx.setupOKXWallet(),
              bitget.setupBitgetWallet(),
              nightly.setupNightly(),
            ],
          })
          .then((selector) => {
            const modal = modalUi.setupModal(selector, {
              theme: 'light',
              description: 'Connect a NEAR wallet to save crash reports to your account.',
            });
            return { selector, modal, network: nearNetwork };
          }),
      )
      .catch((error: unknown) => {
        setup = null;
        throw error;
      });
  }
  return setup;
}
