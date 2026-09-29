<p align="center">
  <img src="assets/logo-large.png" alt="Salad Yook" width="200" />
</p>

<h1 align="center">Salad Yook — Sistem Pemesanan Cafe (QR Self-Order)</h1>

<p align="center">
  <strong>🇮🇩 Indonesia</strong> · <a href="README.en.md">🇬🇧 English</a>
</p>

<p align="center">
  <a href="https://salad-yook.web.id" target="_blank" rel="noopener">
    <img alt="Lihat Live" src="https://img.shields.io/badge/Lihat%20Live-salad--yook.web.id-2d5a27?style=for-the-badge" />
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
  Aplikasi pemesanan menu digital berbasis <b>QR Code</b> untuk kafe. Pelanggan scan QR meja → memesan dari HP → kasir mengonfirmasi → pesanan siap diambil, dengan pemberitahuan pager wireless Kolmi.
</p>

---

## Alur Sistem

```mermaid
flowchart LR
  P[Pelanggan] -->|Scan QR meja| M[Pilih Menu]
  M --> C[Keranjang & Konfirmasi]
  C --> K[Kasir]
  K -->|Konfirmasi pembayaran| PR[Pesanan diproses]
  PR -->|Siap Diambil| A[Pelanggan ambil di kasir]
  A --> S[Selesai]
  C -.->|Tambah pesanan| M
```

## Preview

**Pelanggan**

<p align="center">
  <img src="screenshots/customer-menu.png" alt="Halaman menu pelanggan (desktop)" width="45%" />
  <img src="screenshots/customer-menu-mobile.png" alt="Halaman menu pelanggan (mobile)" width="27%" />
</p>

**Staf & Kasir**

<p align="center">
  <img src="screenshots/cashier-login.png" alt="Login kasir/owner" width="45%" />
  <img src="screenshots/cashier-dashboard.png" alt="Dashboard kasir" width="45%" />
</p>

**QR Self-Order**

<p align="center">
  <img src="screenshots/table-qr-codes.png" alt="QR Code Meja untuk memesan" width="60%" />
</p>

**Alur pemesanan**

<p align="center">
  <img src="screenshots/order-flow.gif" alt="Demo alur pemesanan" width="35%" />
</p>

> Screenshot di atas adalah hasil bawaan (`seed`). Screenshot terbaru bisa di-generate ulang dengan `npm run screenshots`.

---

## Fitur Utama

| | |
|---|---|
| **Pelanggan** | Scan QR meja, pilih menu, keranjang, konfirmasi sebelum bayar, pantau status pesanan real-time, tambah pesanan (self-service), bayar QRIS/tunai. |
| **Kasir** (`/staff`) | Kelola pesanan, konfirmasi pembayaran, set "Siap Diambil", tambah/batal item, cetak struk, notifikasi suara pesanan baru. |
| **Owner** (`/staff`) | Laporan pendapatan (export CSV), kelola menu & stok, kelola akun staf, QR meja, pengaturan kafe & QRIS. |
| **Admin / Godmode** (`/godmode`) | Pemantauan jarak jauh — Log & Aktivitas (error & event), Akses Hari Ini (perangkat + manusia vs AI/bot), Wrangler Info. |
| **Keamanan** | Role terpisah, JWT httpOnly, rate limit, validasi transisi status, ID pesanan unik, sandi ter-hash, backup otomatis. |

## Teknologi

- **Frontend:** React 19 + Vite + Tailwind CSS + Motion (animasi) + Lucide (ikon)
- **Backend Cloudflare:** Hono + D1 (SQLite) + Workers Assets
- **Backend lokal/alternatif:** Express + better-sqlite3
- **Deploy:** Cloudflare Workers

## Kebutuhan

- Node.js **LTS v24** (lihat `.nvmrc`; jalankan `nvm use` di folder ini)

## Menjalankan Lokal

```bash
npm install
npm run dev                 # Express, port 3000 (stabil untuk uji lokal/HP)
# atau
npm run build && npx wrangler dev --port 8787    # Worker (emulasi lokal)
npm run dev:lan             # Worker dapat diakses dari HP (WiFi sama)
```

**Akses:**
- Halaman customer: `http://localhost:3000/?table=1`
- Portal owner/kasir: `http://localhost:3000/staff`
- Portal admin: `http://localhost:3000/godmode`

> Catatan: `wrangler dev` (emulasi lokal miniflare) bisa crash intermittent di sebagian mesin — ini **bukan** masalah kode dan **tidak terjadi di produksi**. Untuk kerja lokal gunakan `npm run dev`.

## Akun & Sandi Awal

- **Sandi awal (owner/kasir/admin) ada di file lokal `.credentials.local`** — file ini **tidak ikut di repo** (aman).
- **WAJIB ganti semua sandi bawaan segera setelah login pertama** sebelum menyerahkan ke pengguna/pembeli:
  - Admin → `/godmode` → Pengaturan Cafe → "Ubah Sandi Saya"
  - Owner/Kasir → `/staff` → Kelola Akun Staf

## Deploy ke Cloudflare

```bash
npm run deploy:prod         # = bash scripts/deploy-cloudflare.sh
```

Script otomatis: build → buat/ambil D1 → migrasi schema → pastikan akun admin → set `JWT_SECRET` (acak) → `wrangler deploy`.

**Setelah deploy (wajib):**
1. Buka `.credentials.local` untuk sandi awal.
2. Login admin di `/godmode` → ganti sandi.
3. Ganti sandi owner/kasir di `/staff`.
4. Uji alur scan → pesan → siap diambil → selesai.

## Keamanan & Backup

- Backup D1: `npm run backup:d1`
- Backup akun staf: `npm run backup:users`
- Reset penjualan (aman, hanya arsip): `npm run reset:orders`
- Pantau error & akses: login admin → `/godmode`
- Log live: `npx wrangler tail`
- Perbaiki data: Dashboard Cloudflare → D1 → Console

## Dokumentasi

- `docs/DEPLOY-CHECKLIST.md` — checklist deploy & monitoring
- `docs/PRODUCTION.md` — panduan operasional & maintenance
- `docs/BUG-REPORT-wrangler.md` — laporan bug `wrangler dev` (emulasi lokal)

---

<p align="center">Dibuat dengan fokus pada kesederhanaan dan kemudahan pemakaian.</p>
