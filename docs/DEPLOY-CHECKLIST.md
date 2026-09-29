# Checklist Deploy & Panduan Pemantauan Rutin

## A. Sebelum Deploy (persiapan)
- [ ] Pastikan Node LTS v24 aktif di terminal: `node -v` → `v24.x` (lihat `.nvmrc`; jalankan `nvm use` di folder ini)
- [ ] Pastikan `wrangler.toml` `database_id` sudah diisi D1 asli (otomatis dilakukan script deploy)
- [ ] Pastikan akun Cloudflare sudah login: `npx wrangler whoami`
- [ ] (Opsional) Siapkan nama domain; jika belum, pakai URL `*.workers.dev` dulu

## B. Deploy
```bash
npm run deploy:prod        # = bash scripts/deploy-cloudflare.sh
```
Script otomatis:
1. Build frontend + server
2. Buat/ambil D1 `salad-yook-db` + isi `database_id` di `wrangler.toml`
3. Jalankan schema + migrasi ke D1 **remote** (tabel `orders.additional_amount`, `daily_stats` mobile/desktop/tablet/bot, `app_logs`)
4. Pastikan akun admin (`admin`) ada
5. Set `JWT_SECRET` acak via `wrangler secret put` (jika belum)
6. `wrangler deploy` → tampilkan URL `https://salad-yook.<subdomain>.workers.dev`

## C. Setelah Deploy (WAJIB)
- [ ] Login `admin` di `https://<url>/godmode` → **ganti password** admin
- [ ] Ganti password default `owner`/`kasir` via dashboard (Kelola Akun Staf)
- [ ] Cek alur: scan meja → pesan → kasir konfirmasi → siap diambil → selesai
- [ ] Pastikan QR meja mengarah ke `https://<url>/?table=N` (bukan `/staff`/`/godmode`)

## D. Ganti APP_URL (biar akurat di Wrangler Info)
`APP_URL` di `wrangler.toml` `[vars]` masih `http://localhost:8787`. Ini hanya info/tampilan (QR meja otomatis memakai alamat asli), tapi sebaiknya dirapikan:
1. Edit `wrangler.toml` → `[vars] APP_URL = "https://salad-yook.<subdomain>.workers.dev"`
2. Re-deploy: `npm run deploy:prod`
> Setelah punya domain, ganti ke domain asli lalu deploy ulang.

## E. Monitoring Rutin
| Frekuensi | Aksi |
|---|---|
| Harian | `npm run backup:d1` (otomatiskan via cron) |
| Mingguan | Login `/godmode` → cek **Log & Aktivitas** (ada error baru?), **Akses Hari Ini** (jumlah & device, bot/AI) |
| Mingguan | Cek **Wrangler Info** (JWT_SECRET aman?, server OK) |
| Mingguan | Dashboard Cloudflare → Workers → Analytics: request/hari, error rate |
| Bulanan | `npm audit` + upgrade dependency |

## F. Cek Kuota (agar tidak kena limit)
- **Workers Free:** 100.000 request/hari → dashboard Cloudflare → Analytics. Jika mendekati, upgrade **Workers Paid ($5/bln, 10 juta request)** — tanpa ubah kode.
- **D1 Free:** 5 juta row read/hari, 100 ribu write/hari → sangat cukup untuk kafe; cek di D1 → dashboard.
- Jika kena **429**: aplikasi otomatis melambat (backoff) lalu pulih; cek Log di godmode.

## G. Jika Terjadi Masalah (jarak jauh)
1. Buka `/godmode` → Log & Aktivitas (lihat error terbaru)
2. `npx wrangler tail` (log live)
3. Dashboard Cloudflare → D1 → Console → SQL perbaikan data
4. `npx wrangler rollback` → balik ke versi sebelumnya
5. Restore backup: `npx wrangler d1 execute salad-yook-db --remote --file=backups/d1-<tanggal>.sql`

## H. Catatan Penting
- Crash `wrangler dev` yang pernah terjadi adalah **bug emulator lokal (miniflare)** di mesin ini — **tidak terjadi di produksi**.
- Untuk kerja lokal/HP: `npm run dev` (port 3000, stabil).

## I. Sandi & Alur Pemulihan (Recovery)
- **Buat akun staf baru** → sistem membuat **sandi acak** dan menampilkannya sekali setelah akun dibuat ("Sandi sementara"). Owner mencatat & membagikan.
- **Kasir lupa sandi** → owner (login) buka **Kelola Akun Staf** → edit akun kasir → isi "Kata Sandi Baru" → simpan. Beri tahu kasir sandi barunya.
- **Owner lupa sandi sendiri** → tidak bisa reset sendiri (butuh login). Minta **admin (godmode)** reset lewat Kelola Akun Staf.
- **Owner & kasir sama-sama lupa** → **admin (godmode)** reset keduanya.
- **Owner/admin ganti sandi sendiri** → tab **Pengaturan Cafe → "Ubah Sandi Saya"** (wajib isi sandi lama + sandi baru).
- **Admin lupa sandi admin** → tidak ada yang bisa reset via UI. Recovery manual via D1 console:
  1. Buat hash PBKDF2: `node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');const h=c.pbkdf2Sync('SANDI_BARU',s,100000,32,'sha256').toString('hex');console.log('pbkdf2:100000:'+s+':'+h)"`
  2. Dashboard Cloudflare → D1 → Console: `UPDATE users SET password='<hash>' WHERE username='admin';`
  3. Login dengan sandi baru, lalu ganti via Pengaturan.
- **Catatan:** sandi tersimpan sebagai hash — tidak bisa "dilihat" teks aslinya. Yang bisa dilihat: sandi sementara saat akun dibuat, dan sandi baru saat diketik.
