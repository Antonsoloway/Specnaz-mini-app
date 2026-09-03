# Work History — Golub Shadow Private v1

Date: 2026-09-03
Status: **SOURCE READY / DEPLOY PENDING**

## Purpose

Add an owner-only private testing sidecar for the existing Telegram bot `Голубь Мира` without changing its public ChatKeeper webhook or group behavior in `ЧАТ ПОБЕДИТЕЛЕЙ`.

Role split remains locked:

- Toster speaks in the admin chat;
- Toster is silent observer / eyes and ears in ЧП;
- Golub is the speaking bot for ЧП;
- Golub private shadow answers use only public CHP observer evidence.

## Files

- `apps-script-live/35_GOLUB_SHADOW_PRIVATE.js`
- `apps-script-live/36_GOLUB_SHADOW_SETUP.js`
- `scripts/patch-golub-shadow-private-v1.py`

The patch inserts the private sidecar before the normal reliable webhook queue. Every unmarked/non-private event continues through the existing Mini App and Royal CRM paths.

## Security

- exact allowed Telegram user_id: `1456874273`;
- existing Royal CRM webhook secret authenticates ChatKeeper ingress;
- existing Specnaz shared secret signs Apps Script -> Worker requests;
- existing `TELEGRAM_BOT_TOKEN` sends answers as Golub;
- no secrets are committed;
- non-owner ingress fails closed;
- no Telegram `setWebhook` call is made.

## Deployment boundary

The existing deployment `Таблица ЧП 1.3` must be updated in place. A new Apps Script deployment must not be created.

A ChatKeeper private-message trigger/forwarder still has to point owner DMs to this existing deployment. GitHub/Cloud Shell cannot mutate the ChatKeeper cabinet without a connected ChatKeeper API/account action.
