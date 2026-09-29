# Salad Yook — Panduan Operasional & Maintenance

Dokumen ini untuk pemilik/admin. Simpan di tempat aman.

## Akun Admin Monitoring

- **Username:** `admin`
- **Password awal:** lihat file lokal **`.credentials.local`** (tidak ikut di repo) — **WAJIB ganti** setelah login pertama.
- Login di: `https://<url-workers-dev>/godmode` (**portal khusus admin**, terpisah dari `/staff`)
- Admin yang login di `/staff` otomatis diarahkan ke `/godmode`; kasir/owner yang buka `/godmode` ditolak.
- Akun admin satu-satunya yang bisa melihat:
  - **Log & Aktivitas** — error & event penting (auto-refresh 10 dtk)
  - **Akses Hari Ini** — request, pengunjung unik, perangkat (HP/Laptop/Tablet), Manusia vs AI/Bot
  - **Wrangler Info** — konfigurasi worker, status JWT_SECRET, info request Cloudflare (colo/kota/protokol/TLS)
- Akun owner/kasir **tidak** bisa melihat semua di atas; akun `admin` juga tersembunyi dari daftar "Kelola Akun Staf" milik owner.

> Catatan: password bisa diganti kapan saja lewat Owner Dashboard → Kelola Akun Staf.

## Pantau Error Jarak Jauh

**Cara 1 — Aplikasi (dari HP/laptop):** Login `admin` → tab **Log & Aktivitas**.
- Menampilkan 200 entri terakhir, auto-refresh 10 detik, filter level (Semua/Error/Warning/Info).
- Error tersimpan di tabel `app_logs` (D1), retensi otomatis 1000 entri.

**Cara 2 — Terminal (laptop, di mana saja):**
```bash
npx wrangler tail            # live stream log worker
```
Lihat `console.error/warn/log` secara real-time.

**Cara 3 — Cloudflare Dashboard:**
- Workers → Analytics: jumlah request, error, latency.
- D1 → nama DB → **Console**: jalankan SQL langsung ke DB produksi (untuk perbaikan data).

## Playbook Penanganan Insiden Jarak Jauh

**Pesanan macet di "Menunggu Verifikasi" padahal sudah dibayar**
1. Cek log (admin) atau `wrangler tail`.
2. Dashboard Cloudflare → D1 → Console:
   ```sql
   UPDATE orders SET status='diproses' WHERE id='ORD-...';
   ```
   (ganti `diproses` dengan status yang benar)

**Pesanan ganda/doppelganger (salah verifikasi)**
```sql
UPDATE orders SET status='dibatalkan' WHERE id='ORD-...';
-- atau hapus jika memang tidak pernah ada
DELETE FROM orders WHERE id='ORD-...';
```

**Deploy baru merusak sesuatu → balik versi lama**
```bash
npx wrangler rollback
```
Kembali ke deployment sebelumnya secara instan.

**Data hilang/rusak → restore dari backup**
```bash
# Backup dulu data saat ini
npm run backup:d1
# Restore
npx wrangler d1 execute salad-yook-db --remote --file=backups/d1-<tanggal>.sql
```

## Maintenance Rutin

| Frekuensi | Aksi |
|---|---|
| Harian | `npm run backup:d1` (otomatiskan via cron/GitHub Actions) |
| Mingguan | Cek tab Log & Aktivitas (error yang muncul), cek Cloudflare usage |
| Bulanan | `npm audit` + upgrade dependency (`wrangler`, `npm update`) |
| Bulanan | Arsip/pangkas order lama (>90 hari) supaya laporan tetap cepat |
| Saat karyawan keluar | Hapus/reset akun staf, ganti password |

**Otomatiskan backup harian** (contoh cron di server/laptop yang menyala):
```
0 3 * * * cd /Users/aulrahman/Documents/Project/sistem-pemesanan-cafe-hijau && /bin/bash scripts/backup-d1.sh >> backups/cron.log 2>&1
```
> Backup D1 remote tersimpan di folder `backups/` (retensi 14 file).

## Batas Cloudflare (kuota gratis)

- **Workers Free:** 100.000 request/hari. Setelah tuning interval polling, beban realistic 20 meja penuh ≈ 25–50 ribu/hari (aman).
- **D1 Free:** 5 juta row read/hari, 100 ribu row write/hari (sangat cukup).
- Jika **error 429** muncul: app otomatis melambat (backoff), lalu pulih sendiri saat kuota tidak lagi kena.
- Kalau nanti traffic jauh naik → upgrade ke **Workers Paid ($5/bln, 10 juta request)** dari dashboard. Tanpa ubah kode.

## Uji Singkat Setiap Perubahan Kode

```bash
npm run lint     # cek tipe
npm run build    # build frontend + server
```
Lalu uji alur: buat pesanan → kasir konfirmasi → siap diambil → selesai → cek log admin.
