# Deploying the Skyra Data backend (free)

This gets the backend online 24/7 with a public **HTTPS** URL and a free
Postgres database, so your admin edits and transactions persist. All steps use
free tiers with **no credit card**.

Stack: **Render** (free web service) + **Neon** (free Postgres).

> Free-tier note: a Render free web service **sleeps after ~15 min of inactivity**;
> the first request after that takes ~30–60s to wake. That's fine for launch/
> testing. Upgrade to a paid instance later for always-on.

---

## 1. Create a free Postgres database (Neon)

1. Go to **https://neon.tech** → sign up (GitHub login is easiest).
2. Create a project (any name, pick a region near Ghana, e.g. EU).
3. On the project dashboard, copy the **connection string**. It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   Keep it handy — this is your `DATABASE_URL`.

*(Supabase works too: create a project → Settings → Database → Connection string.)*

---

## 2. Put the backend in a GitHub repo

Render deploys from GitHub. Push the `skyra-backend` folder to its own repo
(e.g. `skyra-data-backend`):

```bash
cd skyra-backend
git init
git branch -M main
git add .
git commit -m "Skyra Data backend"
git remote add origin https://github.com/<you>/skyra-data-backend.git
git push -u origin main
```

The included `.gitignore` keeps `node_modules`, `.env`, and `data/` out of the
repo — good.

---

## 3. Deploy on Render

1. Go to **https://render.com** → sign up (GitHub login).
2. **New → Web Service** → connect the `skyra-data-backend` repo.
3. Render reads `render.yaml` automatically. If asked, confirm:
   - **Environment:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Plan:** Free
4. Before the first deploy finishes, open the **Environment** tab and set:
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | *(paste the Neon string from step 1)* |
   | `ADMIN_EMAIL` | *your admin email* |
   | `ADMIN_PASSWORD` | *a strong password* |

   `JWT_SECRET` is auto-generated; `NODE_ENV=staging`, `PAYMENT_PROVIDER=mock`,
   `TELECOM_PROVIDER=mock`, `OTP_DEV_MODE=true` come from `render.yaml`.
5. Deploy. When it's live you get a URL like:
   ```
   https://skyra-data-backend.onrender.com
   ```
6. Check it: open `https://<your-app>.onrender.com/health` → should return
   `{"status":"ok",...}`, and `/admin` → the dashboard login.

Your catalogue/settings/transactions now persist in Neon and survive restarts.

---

## 4. Point the mobile app at the live backend

In the **app's** `.env`:

```bash
EXPO_PUBLIC_USE_MOCK_DATA=false
EXPO_PUBLIC_API_BASE_URL=https://skyra-data-backend.onrender.com
```

Restart Expo (`npx expo start -c`). The app now works on **any network,
anywhere** — no PC, no Wi-Fi, no firewall. Rebuild the app (PWA/APK) whenever
you're ready to distribute; it will point at this URL.

---

## 5. Going live (when you have real accounts)

Flip these in Render → Environment, then redeploy:

- `PAYMENT_PROVIDER=paystack` + `PAYSTACK_SECRET_KEY` + `PAYSTACK_WEBHOOK_SECRET`
  (see `PAYSTACK.md`). Set the Paystack **webhook URL** to
  `https://<your-app>.onrender.com/webhooks/paystack`.
- `TELECOM_PROVIDER` + your data aggregator's `TELECOM_API_*` (see
  `../docs/PROVIDERS.md`).
- Real OTP SMS gateway, then `OTP_DEV_MODE=false`.
- `NODE_ENV=production` (the server refuses to boot in production while any
  provider is still `mock` or dev OTP is on — a safety check).

---

## Troubleshooting

- **Deploy log shows "Unsafe production configuration"** → `NODE_ENV=production`
  while a provider is still `mock`. Set `NODE_ENV=staging` for a mock test
  deploy, or finish wiring real providers.
- **App can't reach it** → confirm `EXPO_PUBLIC_API_BASE_URL` is the full
  `https://…onrender.com` (no trailing slash needed) and `USE_MOCK_DATA=false`.
- **First request slow** → the free instance was asleep; it wakes in ~30–60s.
- **Data didn't persist** → `DATABASE_URL` isn't set on Render; the log line
  `Persistence: local files` (instead of `Persistence: Postgres`) confirms it.
