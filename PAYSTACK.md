# Paystack setup (test mode → live)

The backend already implements Paystack (initialise charge, signed-webhook
verification, and verify-on-poll). To turn it on you only need a Paystack
account and a few env values. Ghana supports **Mobile Money + card** via
Paystack.

## 1. Create a Paystack account

- Sign up at https://dashboard.paystack.com (choose Ghana as the country).
- You start in **Test Mode** — perfect for wiring this up with no real money.

## 2. Get your keys

Dashboard → **Settings → API Keys & Webhooks**:

- Copy the **Secret Key** (`sk_test_...`). This is server-only — it goes in the
  backend `.env`, never in the app.
- (The Public Key `pk_test_...` is optional here; the app doesn't need it for
  the hosted-checkout flow.)

## 3. Configure the backend `.env`

```bash
PAYMENT_PROVIDER=paystack
PAYSTACK_SECRET_KEY=<your-paystack-secret-key>
PAYSTACK_WEBHOOK_SECRET=<your-paystack-secret-key>   # same as secret key
# Optional; only used for the browser redirect after payment:
PAYSTACK_CALLBACK_URL=http://localhost:4000/health
```

Restart the backend (`npm run dev`). `GET /config` should now report
`"paymentMethods":["mobile_money","card"]` (Paystack doesn't do airtime — that
stays on your data aggregator).

## 4. How the flow works

1. App creates the order and calls `POST /payments/initialize`.
2. Backend calls Paystack and returns a **hosted checkout URL**.
3. App opens that URL; the user pays (test card / test MoMo).
4. App returns and polls `GET /payments/:id/status`.
5. Backend **verifies** the transaction with Paystack (`verify-on-poll`) and,
   once confirmed, begins data fulfilment. Only then does the app show success.

Because of the verify-on-poll backstop, **local testing works without a public
webhook** — the poll confirms the payment.

## 5. Test cards / MoMo (Test Mode)

Use Paystack's official test values from
https://paystack.com/docs/payments/test-payments — e.g. the test card
`4084 0840 8408 4081`, any future expiry, any CVV, and OTP `123456`. For test
Mobile Money, pick a MoMo channel on the checkout page and use the test prompt.

## 6. Going live

- Add a public **Webhook URL** in the dashboard once the backend is deployed:
  `https://your-domain.com/webhooks/paystack` (signature is HMAC-verified).
- Complete Paystack's business verification, then swap `sk_test_...` for your
  live secret key and set `NODE_ENV=production`.
- Airtime stays wired through your data/airtime aggregator (see
  `../docs/PROVIDERS.md`).
