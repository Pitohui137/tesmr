# Desain: Status Siap Diambil (Pager) + Self-Service Tambah Pesanan + Konfirmasi Checkout

Tanggal: 2026-08-02

## Ringkasan

Mengubah sistem pemesanan Cafe Hijau dengan 3 fitur utama:

1. **Status pengantaran diganti total** — `siap_diantar` menjadi `siap_diambil`. Pesanan yang selesai dibuat tidak lagi diantar waiter, melainkan pelanggan mengambil di meja kasir (diberitahu via pager wireless Kolmi CS101 yang dinyalakan kasir secara terpisah/offline).
2. **Self-service tambah pesanan** — pelanggan yang sadar ada menu kurang setelah memesan bisa menambahkan item sendiri ke pesanan yang masih aktif, sebelum pesanan selesai dibuat.
3. **Konfirmasi checkout** — saat pelanggan mengklik bayar, muncul popup "Apakah pesanan Anda sudah benar?" sebelum pesanan dikirim.

## Alur Status Baru

`menunggu_verifikasi` → `diproses` → `siap_diambil` → `selesai` (+ `dibatalkan`)

- Kasir: "Konfirmasi Pembayaran" (`menunggu_verifikasi`→`diproses`) → "Set Siap Diambil" (`diproses`→`siap_diambil`, kasir juga menekan tombol pager Kolmi secara fisik) → "Selesaikan Pesanan" (`siap_diambil`→`selesai`, konfirmasi ambil + terima selisih).
- Data lama dengan nilai `siap_diantar` dimigrasi menjadi `siap_diambil`.

## Penanganan Item yang Kurang / Terlupakan

- Pelanggan dapat menekan **"Tambah Pesanan"** di halaman status order selama status `menunggu_verifikasi` atau `diproses`.
- Item tambahan dikirim ke `POST /api/orders/:id/items` (dibuat publik dengan pengaman):
  - Jika bukan staf login: wajib mengirim `customerName` + `tableNumber` yang cocok dengan pesanan, dan status pesanan harus `menunggu_verifikasi`/`diproses`.
  - Jika staf (owner/kasir) login: tanpa pengaman tambahan (perilaku kasir saat ini tetap).
- Total pesanan dihitung ulang.
- Jika item ditambahkan saat status **`diproses`** (pembayaran sudah diverifikasi), selisihnya dicatat di kolom baru `additional_amount` pada tabel `orders`. Dashboard kasir menampilkan badge "Item tambahan — tagih Rp X" agar selisih ditagih saat pelanggan mengambil pesanan.
- Saat order menjadi `selesai`, `additional_amount` di-nol-kan (diasumsikan sudah ditagih).

## Verifikasi Pembayaran QRIS

Tetap menggunakan **foto QRIS statis + verifikasi manual kasir** (status `menunggu_verifikasi` sampai kasir mengklik "Konfirmasi Pembayaran"). QRIS statis tidak menyediakan notifikasi otomatis; integrasi payment gateway dinilai tidak diperlukan saat ini.

## Perubahan File

- `src/types.ts` — `OrderStatus` ganti `siap_diantar` → `siap_diambil`; `Order` tambah `additionalAmount?: number`.
- `server/schema.sql` — tabel `orders` tambah kolom `additional_amount INTEGER NOT NULL DEFAULT 0`.
- `server/worker.ts` (D1) — tambah `additional_amount` di mapper/insert; `POST /api/orders/:id/items` publik dengan guard; reset `additional_amount` saat `selesai`.
- `server.ts` (Express) — perubahan serupa + normalisasi data lama `siap_diantar` → `siap_diambil` saat load.
- `src/components/CustomerView.tsx` — tracker langkah 3 "Siap Diambil", popup konfirmasi checkout, tombol + modal "Tambah Pesanan", info selisih bayar.
- `src/components/CashierDashboard.tsx` — tombol "Set Siap Diambil", badge selisih, label status/filter.
- `src/components/WaiterDashboard.tsx` — dihapus (kode mati, tidak ter-routing).

## Verifikasi

`npm run lint` (tsc --noEmit), `npm run build`, migrasi D1 lokal (`ALTER TABLE` + `UPDATE`), lalu uji manual alur lengkap.
