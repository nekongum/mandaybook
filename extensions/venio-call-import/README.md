# Mandaybook Venio Call Import

This Manifest V3 extension captures only the minimum call fields from
`CustomerConversation` responses that the signed-in Venio page has already
requested. It never reads, stores, or forwards the Venio Authorization header,
session token, customer name, notes, contacts, attachments, or audio URLs.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this `extensions/venio-call-import` directory.
5. Keep Mandaybook running at `http://127.0.0.1:3000` or
   `http://localhost:3000`.

## Import workflow

1. Sign in to Venio at `https://app.veniocrm.com`.
2. Open the target customer's Activity/Conversation view. The extension records
   sanitized Call activities returned by Venio across list, pagination, and
   Conversation Followup task responses for that customer.
3. Open the matching Manday Project.
4. Click **Import from Venio** in Actual Work Log.
5. On the first import, confirm the explicit customer link. The numeric Venio
   customer ID is saved on that Mandaybook company; company names are not used
   for automatic matching.
6. If a project has several implementors, choose one before importing.

The import appends one normal `Phone Call` Actual Work row per activity. Each row
uses that activity's own `dateConversation` and `callMinutes`. Existing
Mandaybook calculation functions then calculate totals and mandays normally.
Re-imported `conversationId` values are ignored.

## Production host

The manifest intentionally permits only Venio and the two local Mandaybook
origins. Before deploying Mandaybook elsewhere, add its exact HTTPS origin to
both `host_permissions` and the Mandaybook content-script `matches`, and add the
same exact origin to `allowedOrigins` in `mandaybook-content.js`.

## Current response fields

- Call type: `type === 110011` (`typeName === "Call"` is used only when type is absent)
- Implementor: `createdByUserId`
- Duration: `callMinutes`
- Activity key: `conversationId`
- Activity date: `dateConversation`
- Customer key: `customerId`

The extension supports a single object in `data`, an array in `data`, an array
in `data.value`, a root array, and a call nested in `data.conversation`. Customer
IDs are read from the sanitized Call records rather than inferred from request
URLs. It imports only responses naturally observed while the Venio page is
open; it does not extract a browser token to make independent API requests.
