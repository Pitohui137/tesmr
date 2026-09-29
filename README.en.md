<p align="center">
  <img src="assets/logo-large.png" alt="Salad Yook" width="180" />
</p>

<h1 align="center">🌿 Salad Yook — Cafe Ordering System (QR Self-Order)</h1>

<p align="center">
  <a href="README.md">🇮🇩 Indonesia</a> · <strong>🇬🇧 English</strong>
</p>

<p align="center">
  <a href="https://salad-yook.web.id" target="_blank" rel="noopener">
    <img alt="View Live" src="https://img.shields.io/badge/View%20Live-salad--yook.web.id-2d5a27?style=for-the-badge" />
  </a>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React%2019-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind%20CSS-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img alt="Hono" src="https://img.shields.io/badge/Hono-E36002?style=flat-square&logo=hono&logoColor=white" />
  <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" />
  <img alt="Cloudflare D1" src="https://img.shields.io/badge/Cloudflare%20D1-F38020?style=flat-square&logo=cloudflare&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" />
</p>

<p align="center">
  A QR Code based digital menu ordering app for cafes. Customers scan the table QR → order from their phone → cashier confirms → order is ready for pickup (with Kolmi wireless pager notification).
</p>

---

## 👀 Preview

**Customers**

<p align="center">
  <img src="screenshots/customer-menu.png" alt="Customer menu page (desktop)" width="45%" />
  <img src="screenshots/customer-menu-mobile.png" alt="Customer menu page (mobile)" width="27%" />
</p>

**Staff & Cashier**

<p align="center">
  <img src="screenshots/cashier-login.png" alt="Cashier/owner login" width="45%" />
  <img src="screenshots/cashier-dashboard.png" alt="Cashier dashboard" width="45%" />
</p>

**QR Self-Order**

<p align="center">
  <img src="screenshots/table-qr-codes.png" alt="Table QR codes for ordering" width="60%" />
</p>

**Ordering flow demo**

<p align="center">
  <img src="screenshots/order-flow.gif" alt="Ordering flow demo" width="35%" />
</p>

> 💡 The screenshots above use the default (seeded) data. You can regenerate them anytime with `npm run screenshots`.

---

## 🚀 Key Features

| | |
|---|---|
| 👤 **Customer** | Scan table QR, pick menu, cart, confirm before paying, track order status in real-time, add items (self-service), pay via QRIS/cash. |
| 🧑‍💼 **Cashier** (`/staff`) | Manage orders, confirm payments, set "Ready for Pickup", add/cancel items, print receipts, sound notifications for new orders. |
| 📊 **Owner** (`/staff`) | Revenue reports (CSV export), manage menu & stock, manage staff accounts, table QR, cafe & QRIS settings. |
| 🛡️ **Admin/Godmode** (`/godmode`) | Remote monitoring — **Logs & Activity** (errors & events), **Today's Access** (devices + human vs AI/bot), **Wrangler Info** (server & Cloudflare status). |
| 🔐 **Security** | Separate roles, httpOnly JWT, rate limiting, status-transition validation, unique order IDs, automatic backups. |
| ✨ **Experience** | Responsive menu page, time-based greeting, smooth animations, floating cart with micro-interactions. |

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite + Tailwind CSS + Motion (animations) + Lucide (icons)
- **Cloudflare backend:** Hono + D1 (SQLite) + Workers Assets
- **Local/alternative backend:** Express + better-sqlite3
- **Deploy:** Cloudflare Workers

## ⚡ Requirements

- Node.js **LTS v24** (see `.nvmrc`; run `nvm use` inside this folder)

## 🏃 Running Locally

```bash
npm install
npm run dev                 # Express on port 3000 (stable for local/phone testing)
# or
npm run build && npx wrangler dev --port 8787    # Worker (local emulation)
npm run dev:lan             # Worker accessible from your phone (same WiFi)
```

**Access:**
- Customer page: `http://localhost:3000/?table=1`
- Owner/cashier portal: `http://localhost:3000/staff`
- Admin portal: `http://localhost:3000/godmode`

> ⚠️ Note: `wrangler dev` (miniflare local emulation) can intermittently crash on some machines — this is **not** a code issue and **does not happen in production**. For local work use `npm run dev`.

## 🔑 Default Accounts & Passwords

- **Default passwords (owner/cashier/admin) are in the local file `.credentials.local`** — this file is **not committed to the repo** (safe).
- **You MUST change all default passwords right after your first login** before handing the app to users/customers:
  - Admin → `/godmode` → Cafe Settings → "Change My Password"
  - Owner/Cashier → `/staff` → Manage Staff Accounts

## 🔄 Usage Flow

1. Customer scans the table QR → enters name → picks menu → cart → "Pay & Order" → confirm.
2. Cashier sees the new order → confirms payment → order is processed.
3. When ready → cashier clicks "Set Ready for Pickup" (+ turns on the Kolmi pager) → customer picks up at the counter.
4. Cashier "Completes Order" → transaction finished.
5. Customer can "Add Items" before the order is completed; the difference is paid at the counter.

## 🚀 Deploy to Cloudflare

```bash
npm run deploy:prod         # = bash scripts/deploy-cloudflare.sh
```

The script automates: build → create/fetch D1 → migrate schema → ensure admin account → set random `JWT_SECRET` → `wrangler deploy`.

**After deploying (required):**
1. Open `.credentials.local` for the default passwords.
2. Login admin at `/godmode` → change password.
3. Change owner/cashier passwords at `/staff`.
4. Test the scan → order → ready → done flow.

## 💾 Backup & Monitoring

- D1 backup: `npm run backup:d1`
- Monitor errors & access: admin login → `/godmode`
- Live logs: `npx wrangler tail`
- Fix data: Cloudflare Dashboard → D1 → Console

## 📚 Documentation

- `docs/DEPLOY-CHECKLIST.md` — deploy & monitoring checklist
- `docs/PRODUCTION.md` — operational & maintenance guide
- `docs/BUG-REPORT-wrangler.md` — `wrangler dev` (local emulation) bug report

---

<p align="center">Made with 💚 for cafes</p>
