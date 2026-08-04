# Mandaybook Venio Activity Import

This Manifest V3 extension captures only the minimum call and meeting fields
from responses that the signed-in Venio page has already requested. It never
reads, stores, or forwards the Venio Authorization header, session token,
customer name, notes, contacts, attachments, meeting descriptions, or audio
URLs.

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
   sanitized Call and Meeting activities returned by Venio across list,
   pagination, and detail responses for that customer.
3. Open the matching Manday Project.
4. Choose the **Calls** or **Meetings** tab and click its import button in
   Actual Work Log.
5. On the first import, confirm the explicit customer link. The numeric Venio
   customer ID is saved on that Mandaybook company; company names are not used
   for automatic matching.
6. If a project has several implementors, choose one before importing.

Call imports append a `Phone Call` Actual Work row using `dateConversation` and
`callMinutes`. Meeting imports append a `Meeting` row and calculate its duration
from `feedItem.dateStart` through `feedItem.dateEnd`. Existing Mandaybook
calculation functions then calculate totals and mandays normally. Re-imported
activity IDs are ignored separately for calls and meetings.

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

Meeting fields:

- Meeting type: `type === 210016` for a completed activity report. Planned
  activities such as `210001` and `210002` are intentionally ignored.
- Implementor: `userId`
- Duration: difference between `feedItem.dateStart` and `feedItem.dateEnd`
- Activity key: `refId`
- Activity date: `feedItem.dateStart`
- Customer key: `customerId`

Only completed activity reports are imported; creating or assigning a meeting
plan does not create Actual Work.

The extension supports a single object in `data`, an array in `data`, an array
in `data.value`, a root array, and a call nested in `data.conversation`. Customer
IDs are read from sanitized activity records rather than inferred from request
URLs. It imports only responses naturally observed while the Venio page is
open; it does not extract a browser token to make independent API requests.
