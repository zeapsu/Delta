---
title: Plaid Trial setup
---

# Set up Plaid's free Trial plan

Delta needs a Plaid account to reach your bank. For personal use, Plaid's **Trial plan** is enough: it's free, it connects real accounts, and for most people it's approved automatically. This page walks through it. The [self-hosting guide](self-hosting.md) covers the rest of the setup.

Plan details below come from Plaid's help center as of October 2026. Plaid changes its plans from time to time, so check [What is the Plaid Trial plan?](https://support.plaid.com/hc/en-us/articles/39994173227159-What-is-the-Plaid-Trial-plan) if something doesn't match.

## What you get

| | Trial plan |
| --- | --- |
| Cost | Free |
| Who can use it | Developers in the US or Canada without an existing Plaid production account |
| Banks | US and Canadian institutions, including OAuth banks like Chase, Bank of America, Wells Fargo, Capital One, Citi and American Express |
| Connections | Up to **10 Items** (an Item is one login at one bank, which can cover several accounts) |
| API calls | Unlimited on connected Items |
| Products | Auth, Transactions (with Transactions Refresh), Balance, Identity, Assets, Liabilities, Investments (with Investments Refresh), Statements |

Delta uses **Transactions** and **Balance**, plus **Investments** if you link a brokerage. All three are on the Trial plan.

Two limits to know about:

- **Removing a connection doesn't give the slot back.** On the Trial plan, removing an Item (`/item/remove`) doesn't free a slot against the 10-Item cap. Link each bank once, and when one needs you to sign in again use its **Reconnect** button rather than linking it a second time, which would use another slot.
- **Upgrading is one-way.** If you later move to a paid production plan, you can't go back to the Trial plan.

## 1. Sign up

1. Go to [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup) and create an account. Describe what you're building honestly: a personal finance dashboard for yourself, connecting only your own accounts.
2. Finish the identity verification Plaid asks for. Most accounts are approved automatically. If yours is flagged for review, Plaid emails you within 2 to 3 business days.

## 2. Get your keys

Open **Developers → Keys** ([dashboard.plaid.com/developers/keys](https://dashboard.plaid.com/developers/keys)) and copy:

- your `client_id`,
- the **Sandbox** secret, for trying things out with fake banks,
- the **Production** secret, for your real accounts.

Put them in Delta's `.env`:

```bash
PLAID_CLIENT_ID=your-client-id
PLAID_SANDBOX_SECRET=your-sandbox-secret
PLAID_PRODUCTION_SECRET=your-production-secret
```

Never commit `.env` or paste the secrets into an agent or chat.

## 3. Try sandbox first

Start with `PLAID_ENV=sandbox`. Sandbox Items are fake and don't count against the 10-Item cap, so use them to check that Delta runs, syncs and talks to your agent. In Plaid Link, pick any bank and sign in with `user_good` / `pass_good`.

At startup Delta logs `[delta] Plaid sandbox: keys OK` when the keys work, and the welcome page shows the same.

## 4. Switch to your real accounts

Sandbox and production data must not share a database. To switch:

1. Stop Delta and start from an empty database: a fresh Docker volume (`docker compose down -v` deletes the sandbox data), or a new `DATABASE_PATH` when running from source.
2. Set `PLAID_ENV=production` in `.env` and start Delta again. The log should say `[delta] Plaid production: keys OK`.
3. Click **Connect account** and link your banks. Each bank login uses one of your 10 Items, so link the ones you care about most first.

OAuth banks (Chase, Bank of America, Wells Fargo and others) usually show up in Link 6 to 24 hours after your account is approved, and a few take longer or need extra registration in the dashboard. If one is missing, try again the next day or ask [Plaid support](https://dashboard.plaid.com/support/new).

## How Delta keeps data fresh

Banks only send new transactions to Plaid a few times a day. To get them sooner, Delta's sync job asks Plaid for a **Transactions Refresh** before each sync (every 6 hours by default), waits 3 minutes, then pulls the changes. Refresh is part of the Trial plan's Transactions product, so this costs nothing there. On a paid plan, Plaid may bill refreshes per call; set `SYNC_INTERVAL_HOURS` higher if you want fewer of them.

Some connections don't support refresh (for example credit-card-only Capital One logins answer `PRODUCTS_NOT_SUPPORTED`). Delta skips those and still syncs them.

## When you outgrow it

If you need more than 10 connections or a product that isn't on the Trial plan, apply for a paid production plan from the Plaid dashboard ([How do I upgrade?](https://support.plaid.com/hc/en-us/articles/39917307426967-How-do-I-upgrade-from-the-Trial-plan-to-a-paid-Production-plan)). Paid plans bill per connected Item and, for some products, per call. Delta doesn't need any changes: your keys and `PLAID_ENV=production` stay the same.
