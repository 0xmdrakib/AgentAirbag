# Security notes

What Agent Airbag stores, how sign-in and saving are controlled, and what is not covered. Nothing
here is an audit result: no third party has reviewed this code, and the controls below are the ones
the tests in `packages/server/test` exercise.

## What the site holds

The simulator holds no funds, no private keys and no secrets. It runs in the browser and moves no
real money. The only stored data comes from the optional wallet sign-in:

| Data                                                      | Where         | Kept                          |
| --------------------------------------------------------- | ------------- | ----------------------------- |
| NEAR account id                                           | `users`       | While the account exists      |
| Session token hash (SHA-256 of a random 32-byte token)    | `sessions`    | 7 days, newest 10 per account |
| Saved reports                                             | `runs`        | Newest 50 per account         |
| One-time sign-in challenges                               | `auth_nonces` | 5 minutes                     |
| Request counters, keyed by a hashed address or account id | `rate_limits` | 2 days                        |

Raw IP addresses are never stored. The wallet signs a message only: no transaction, no contract
call, no cost. The signing key stays in the wallet.

## Sign-in

1. The server issues a random 32-byte nonce inside a readable message, valid for 5 minutes and
   usable once (it is deleted when read).
2. The wallet signs it as a NEP-413 message. The server checks the signature against the exact
   message, nonce and recipient it issued. The optional `callbackUrl` field is accepted with or
   without a value, because some wallet modules never forward it.
3. The server asks the NEAR RPC whether that key belongs to the account, and fails closed: an
   unclear answer refuses the sign-in. A valid signature alone proves nothing about the account name.
4. The session is an `HttpOnly`, `SameSite=Lax` cookie that is sent over HTTPS only on the live
   site. Only the hash of the token is stored.

## Controls on requests

| Control                          | Value                                                                | Why                                           |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Nonce requests                   | 40 per minute per address                                            | One sign-in needs one or two                  |
| Sign-in attempts                 | 20 per minute and 200 per day per address                            | Each valid signature costs an RPC call        |
| Saves                            | 30 per minute and 300 per day per address, 20 per minute per account | Each save is up to 512 KB                     |
| Report size                      | 512 KB                                                               | A real report is about 380 KB minified        |
| Sign-in body size                | 16 KB                                                                | A sign-in is a few hundred bytes              |
| Saved runs per account           | 50, oldest removed                                                   | Bounds storage per account                    |
| Sessions per account             | 10, oldest removed; expired ones removed on sign-in                  | Bounds storage per account                    |
| Browser POST from another origin | Refused with 403                                                     | A second layer behind the cookie's `SameSite` |
| `/api` responses                 | `Cache-Control: no-store`                                            | They carry session and account data           |
| Site headers                     | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`       | Basic hardening that cannot break wallets     |

The limits are loose on purpose. They stop scripts that hammer sign-in or saving, not a person
using the site, and a shared office address still has room. A limited request gets HTTP 429 with a
`Retry-After` header and a plain message. If the counter store cannot answer, the request goes
through: refusing real users is the worse failure.

Counters are keyed on the address the host reports. Vercel overwrites those headers, so a visitor
cannot choose their own. Behind no proxy they can be forged, which only weakens a limit.

## Not covered

- **Saved reports are not signed or recomputed.** The server checks the shape and size, not the
  numbers. A signed-in user can save an edited report into their own list. It is shown back only to
  that account, and a verdict is never taken from a saved report. Share links carry the report in
  the URL and are unauthenticated by design.
- **Limited access keys.** The ownership check accepts any access key of the account, including a
  function-call key. An app holding such a key for an account could sign in as it here. What it could
  reach is that account's saved simulated reports.
- **Passkey-only accounts.** A near.com account controlled only by a passkey cannot sign in. The
  passkey is bound to near.com, and the whole site still works without a wallet.
- **No content security policy.** Wallets open popups and load their own frames; a strict policy or
  `Cross-Origin-Opener-Policy` would break them, so neither is set.
- **Dependency advisories.** `pnpm audit --prod` reports advisories in the browser wallet libraries
  (`@near-wallet-selector/*`, which NEAR has deprecated in favour of NEAR Connect). No advisory is
  reported in the server or core packages. Moving to NEAR Connect is on the roadmap.
- **Address limits are per address.** Many addresses can add up. Neon's own plan limits apply as a
  last bound.
- **No audit.** No penetration test or third-party review has been done.

## Reporting a problem

Open an issue at https://github.com/0xmdrakib/AgentAirbag/issues. For anything that should not be
public, say so in the issue and leave out the details.
