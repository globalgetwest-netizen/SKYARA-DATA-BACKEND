# Skyra Data — Backend

The backend API for the Skyra Data mobile app. It owns the catalogue, orders,
payments, data fulfilment, authentication and support — and it is the **only**
place that holds payment/telecom secrets.

Built with **Node + Express + TypeScript**. Runs out of the box with mock
payment and telecom providers, so you can drive the whole app end-to-end today,
then swap in **Paystack** and a real data aggregator behind clean interfaces
without touching the rest of the code.

Implements the contract in the app's `docs/API.md`.

---

## Quick start

```bash
npm install
cp .env.example .env      # defaults to mock providers — no accounts needed
npm run dev               # http://localhost:4000
```

Check it's alive:

```bash
curl http://localhost:4000/health
```

### Point the mobile app at it

In the **app's** `.env`:

```bash
EXPO_PUBLIC_USE_MOCK_DATA=false
# Use your computer's LAN IP (not localhost) so a phone on the same Wi-Fi can reach it.
# Expo prints this IP when you run `expo start` (e.g. exp://172.20.10.14:8081).
EXPO_PUBLIC_API_BASE_URL=http://172.20.10.14:4000
```

Restart Expo. The app now talks to this backend. OTP code in dev mode is
`123456`.

---

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Hot-reloading dev server (tsx) |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |

---

## Endpoints

| Method | Path | Auth | Notes |
|-------|------|------|-------|
| GET | `/health` | – | Service + provider status |
| GET | `/config` | – | Enabled payment methods (incl. Airtime) + USSD code |
| GET | `/admin` | – | Admin dashboard (web UI) |
| POST | `/admin/api/login` | – | Admin sign-in → session token |
| * | `/admin/api/*` | admin | Bundles, networks, transactions, tickets, settings |
| GET | `/networks` | – | Network catalogue |
| GET | `/networks/:network/bundles` | – | Bundles for a network |
| POST | `/orders` | optional | Create order (guest-friendly); `Idempotency-Key` |
| GET | `/orders` | required | Signed-in user's history |
| GET | `/orders/:id` | optional | Poll a single order |
| POST | `/orders/:id/retry` | optional | Re-attempt a failed fulfilment |
| POST | `/payments/initialize` | optional | Start payment; `Idempotency-Key` |
| GET | `/payments/:id/status` | optional | Poll payment/order status |
| POST | `/auth/otp/request` | – | Send OTP (rate-limited) |
| POST | `/auth/otp/verify` | – | Verify OTP → session (JWT) |
| GET | `/me` | required | Current user |
| POST | `/auth/signout` | required | End session |
| POST | `/support/tickets` | optional | Create a support ticket |
| POST | `/ussd` | gateway | USSD menu for feature phones (aggregator webhook) |
| GET/POST | `/ussd/simulate` | – | Local USSD tester (JSON) |
| POST | `/webhooks/paystack` | signature | Payment confirmation (raw body) |
| POST | `/webhooks/mock` | – | Drive the mock provider manually |

### Payment methods (incl. Pay with Airtime)

`GET /config` returns the payment rails the active provider supports, e.g.
`["mobile_money","airtime","card"]`. The app renders exactly these — it never
hard-codes methods. Airtime is delivered by your data/airtime aggregator (not a
card PSP), so the mock provider advertises it out of the box; wire it to your
aggregator's airtime-debit API for production.

### USSD (feature phones)

`POST /ussd` speaks the Africa's Talking protocol (form body `phoneNumber` +
`text`; plain-text `CON`/`END` reply) and is easily adapted to Hubtel/Nsano.
Every USSD purchase runs through the **same** order + payment services as the
app, so app and dial-code sales share one system and one history. Test the full
menu locally without a short code:

```bash
curl "http://localhost:4000/ussd/simulate?phoneNumber=0241234567&text=1*2*1*2"
# 1=MTN · 2=1GB · 1=my number · 2=Airtime  → creates a real order
```

Set `USSD_SHORT_CODE` to the code you rent from a USSD aggregator to go live.

Full request/response shapes: **`../docs/API.md`** (in the app repo).

---

## Admin dashboard

A self-contained web dashboard is served at **`http://localhost:4000/admin`**.
Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (from `.env` — change before any
deploy). From it you can manage, live:

- **Bundles** — add/edit/delete, set price · data/GB · validity · badge · availability
- **Networks** — name, status, logo URL
- **Transactions** — search, view, retry failed
- **Support** — view tickets, mark resolved
- **Settings** — processing fee, USSD short code

Every edit is saved to JSON in `DATA_DIR` (survives restarts) and reflects on
the app immediately (the app fetches the catalogue live). Swap the JSON stores
for a database at deploy — the dashboard and app are unaffected.

### One central admin (SSO-ready)

To manage Skyra from a central admin hub with a single login, set
`ADMIN_SSO_SECRET`. Your hub then mints a JWT `{ sub, role: "admin" }` signed
with that secret; Skyra accepts it on any `/admin/api/*` call. Each product keeps
its own data + API — you centralize only the login and (optionally) the UI. The
customer app stays fully independent and never references the admin layer.

## Architecture

```
Express routes
   │  validate (Zod) → services
Services
   ├─ orderService        create / read / status transitions
   ├─ paymentService      initialize · confirmPayment (the state-machine funnel)
   ├─ fulfilmentService   deliver data AFTER verified payment
   └─ authService         OTP + JWT
        │  depend on provider interfaces, not concrete vendors
Providers
   ├─ payment/   PaymentProvider  → Mock | Paystack (Flutterwave-ready)
   └─ telecom/   TelecomProvider  → Mock | HTTP aggregator template
Store (in-memory repository — swap for a real DB)
```

### Transaction state machine

`confirmPayment` is the single funnel for "payment confirmed", called by the
**provider webhook** in production and by the **mock timeline** in dev. Data
delivery only ever runs after payment is verified, and an order reaches
`SUCCESS` only when the telecom provider confirms delivery.

```
PENDING_PAYMENT → PAYMENT_PROCESSING → PAYMENT_SUCCESS
   → FULFILMENT_PROCESSING → SUCCESS | FAILED
```

---

## Going to production

1. **Payments** — set `PAYMENT_PROVIDER=paystack` and `PAYSTACK_SECRET_KEY`,
   `PAYSTACK_WEBHOOK_SECRET`, `PAYSTACK_CALLBACK_URL`. Point your Paystack
   dashboard webhook at `/webhooks/paystack`. (Flutterwave slots in the same
   way — implement `FlutterwaveProvider` and register it.)
2. **Data delivery** — set `TELECOM_PROVIDER` to your aggregator and
   `TELECOM_API_BASE_URL` / `TELECOM_API_KEY`; adapt the request/response
   mapping in `src/providers/telecom/httpTelecomProvider.ts`.
3. **Database** — replace `src/store/store.ts` (in-memory Maps) with a real
   database. The service layer is untouched.
4. **SMS** — send the real OTP in `src/services/authService.ts` (`OTP_DEV_MODE=false`)
   via a Ghana SMS gateway (Hubtel, Arkesel, etc.).
5. **Config** — strong `JWT_SECRET`, `NODE_ENV=production`, HTTPS in front.
   `assertProductionConfig()` refuses to boot with mock providers or dev OTP in
   production.

See the app's **`docs/PROVIDERS.md`** for the full integration + security
checklist.

---

## Security notes

- Secrets live only here (env vars) — never in the mobile client.
- Webhook signatures are HMAC-verified against the raw request body.
- Payment is verified server-side (webhook + on-demand verify) before any data
  is delivered; the client can never mark a purchase successful.
- Idempotency keys on order + payment creation prevent duplicate charges.
- OTP endpoints are rate-limited with expiry + attempt caps; JWT sessions.
