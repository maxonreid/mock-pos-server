# mock-pos-server — CLAUDE.md

This file provides context for AI assistants working on the Mock POS Server.

---

## What This Is

`mock-pos-server` is a **standalone Fastify application** that simulates a third-party Point-of-Sale system. It exists solely to make the OrderBridge portfolio demo work end-to-end without requiring a real restaurant POS.

It is **not part of the OrderBridge codebase** — it represents an external system that OrderBridge connects *to*. During a demo, it plays the role of, for example, Square or Toast.

---

## Key Concept: Two Separate Products

Understanding the distinction between this server and the OrderBridge dashboard is critical:

| | mock-pos-server | OrderBridge Dashboard |
|---|---|---|
| **What it is** | Simulated destination POS | Control panel for OrderBridge middleware |
| **Who "makes" it** | A fictional restaurant POS vendor | Maxon Torres (the portfolio project) |
| **URL** | Its own Railway deployment | Vercel |
| **Design** | Navy + amber, white body, Inter font | Dark `#0A0F1E`, cyan, Share Tech Mono |
| **Page in OB dashboard** | n/a | POSPanelPage.tsx (`/pos`) — connects *to* this server |

The visual contrast is intentional. When a recruiter or client watches the demo, they should immediately see two visually distinct products communicating with each other.

---

## Directory Structure

```
mock-pos-server/
├── src/
│   └── server.ts         # All routes, in-memory state, OAuth logic
├── views/
│   ├── authorize.hbs     # OAuth authorization screen
│   └── orders.hbs        # Orders terminal UI
├── package.json
├── tsconfig.json
└── README.md
```

HTML is rendered server-side via `@fastify/view` + Handlebars. Route handlers pass plain data objects to templates — no HTML strings in `server.ts`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Fastify 4.x + TypeScript |
| Templating | Handlebars via `@fastify/view` |
| State | In-memory (no database) |
| Port | 3100 (local) / Railway-assigned (production) |

No database. Orders array and token set are held in memory. Restarting the server clears all state — this is intentional for demos.

---

## Routes

### OAuth Flow
| Method | Path | Description |
|---|---|---|
| GET | `/oauth/authorize` | Renders `authorize.hbs` — OAuth consent screen with Allow / Deny |
| POST | `/oauth/authorize` | Handles allow/deny. On allow: generates auth code, redirects to callback URL with `?code=`. On deny: redirects with `?error=access_denied` |
| POST | `/oauth/token` | Exchanges auth code for access token. Validates code exists and hasn't expired. Returns `{ access_token, token_type, scope }` |

### Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/orders` | Bearer token | Receives an injected order from OrderBridge. Validates token, stores order, schedules auto-transition to `received`. Returns `{ posOrderId }` |
| GET | `/orders` | None | Renders `orders.hbs` — live orders terminal UI |

### Utility
| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok", service, version, uptime }` |

---

## In-Memory State

```ts
const orders: PosOrder[] = []
const issuedTokens = new Set<string>()
const authCodes = new Map<string, { clientId: string; expiresAt: number }>()
```

- **orders** — all injected orders, shown on the `/orders` terminal page
- **issuedTokens** — valid access tokens; checked on every `POST /orders` request
- **authCodes** — short-lived codes issued during OAuth authorize step; expire after 10 minutes, deleted on use

---

## Token & ID Formats

| Value | Format | Example |
|---|---|---|
| Access token | `mock_pos_` + 20 random bytes hex | `mock_pos_a3f7c2...` |
| POS Order ID | `POS-ORD-` + random int 90000–99999 | `POS-ORD-93847` |
| Auth code | `code_` + 16 random bytes hex | `code_d4e9f1...` |

---

## Order Lifecycle

1. `POST /orders` receives an injected order from OrderBridge
2. Order is stored with status `new`
3. After **4 seconds**, status automatically transitions to `received`
4. The `/orders` terminal page auto-refreshes every 4 seconds and reflects the updated status

This delay mimics a real POS acknowledging and queuing the order.

---

## Handlebars Templates

### `views/authorize.hbs`
Context object passed from route handler:
```ts
{
  redirect_uri: string   // passed through to hidden form field
  client_id: string      // displayed in meta grid, defaults to "orderbridge"
  state: string          // passed through to hidden form field
  scope: string          // displayed in meta grid
}
```

### `views/orders.hbs`
Context object passed from route handler:
```ts
{
  orders: Array<{
    posOrderId: string
    platformLabel: string    // e.g. "🔴 DoorDash" — resolved from platform key
    itemSummary: string      // e.g. "Burger ×2, Fries ×1 +1 more"
    totalFormatted: string   // e.g. "24.50"
    timeFormatted: string    // e.g. "14:32:08"
    isNew: boolean           // true if status === "new"
  }>
  todayCount: number
  hasOrders: boolean         // used for {{#if hasOrders}} / empty state branch
}
```

All data formatting (platform labels, time, totals, item summaries) happens in the route handler before passing to the template. Templates contain no logic beyond `{{#if}}` and `{{#each}}`.

---

## Design System

All design decisions follow one rule: **look like a real third-party product, not something built by the OrderBridge team.**

| Element | Value | Rationale |
|---|---|---|
| Header background | `#1a2744` (navy) | Close to OrderBridge's dark but visibly distinct |
| Accent color | `#f59e0b` (amber) | OrderBridge uses cyan — amber creates immediate contrast |
| Body background | `#ffffff` (white) | OrderBridge is dark — light body is the most powerful differentiator |
| Font | `Inter` | OrderBridge uses `Share Tech Mono` — Inter signals a different design team |
| Logo text | `BridgePOS` | Generic product name — not OrderBridge-branded |

The OAuth screen in particular should feel like a real third-party OAuth consent screen (think: "Authorize OrderBridge to access your POS").

---

## Environment Variables

```env
PORT=3100                     # Optional — defaults to 3100
CLIENT_ID=mock_pos_client     # OAuth client ID expected from OrderBridge
CLIENT_SECRET=mock_pos_secret # OAuth client secret expected from OrderBridge
```

These are hardcoded defaults for local dev. Set them in Railway for production.

In the OrderBridge backend `.env`, set:
```env
MOCK_POS_URL=https://your-mock-pos.railway.app
```

---

## Local Development

```bash
cd mock-pos-server
npm install
npm run dev     # ts-node-dev, watches for changes
```

Server starts at: `http://localhost:3100`

Test endpoints:
- `http://localhost:3100/health` — should return `{ status: "ok" }`
- `http://localhost:3100/orders` — orders terminal UI

---

## Deployment

Deploy as a **separate Railway service** from the main `orderbridge-api`.

**Build:** `npm run build` (tsc → dist/)
**Start:** `node dist/server.js`

After deploying, copy the Railway URL and set `MOCK_POS_URL` in the `orderbridge-api` Railway service environment variables.

---

## OAuth Flow (Full)

This is the complete sequence when a user clicks "Connect POS" on the OrderBridge Settings page:

```
1. OrderBridge dashboard → user selects Mock POS in Settings

2. OrderBridge backend constructs authorize URL:
   https://mock-pos.railway.app/oauth/authorize
     ?client_id=mock_pos_client
     &redirect_uri=https://orderbridge-api.railway.app/pos/callback
     &response_type=code
     &scope=orders:write%20orders:read
     &state=<random_csrf_token>

3. User is redirected to mock-pos GET /oauth/authorize
   → authorize.hbs renders: "Authorize OrderBridge?" consent screen

4. User clicks Allow → POST /oauth/authorize { action: "allow" }
   → mock-pos generates auth code, stores in authCodes Map with 10min expiry
   → redirects to: https://orderbridge-api.railway.app/pos/callback?code=code_d4e9f1...&state=...

5. OrderBridge backend POSTs to mock-pos POST /oauth/token:
   { client_id, client_secret, code, grant_type: "authorization_code" }
   → Validates code exists + not expired → deletes code (single use)
   → Returns: { access_token: "mock_pos_a3f7c2...", token_type: "Bearer", scope: "orders:write orders:read" }

6. OrderBridge backend AES-256 encrypts token, stores in Token table
7. Dashboard shows "Connected ✓"

8. From now on, every injected order:
   POST https://mock-pos.railway.app/orders
   Authorization: Bearer mock_pos_a3f7c2...
   { ...translated order payload }
   → Returns: { posOrderId: "POS-ORD-93847" }
```

---

## Relationship to OrderBridge Codebase

This server is referenced from the main project in two places:

1. **`orderbridge-api`** — `MOCK_POS_URL` env var points to this server; the injector module POSTs orders here
2. **`SimulatorPage.tsx`** — dev tools tab shows mock POS connection status

Do not import from or depend on the main `orderbridge-api` or `orderbridge-dashboard` codebases. This is a fully independent application.

---

## Pending Tasks

- [ ] Deploy as separate Railway service
- [ ] Set `MOCK_POS_URL` env var in `orderbridge-api` Railway config
- [ ] Set `CLIENT_ID` and `CLIENT_SECRET` env vars in Railway (must match OrderBridge backend config)