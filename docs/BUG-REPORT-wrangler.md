# Bug Report — wrangler dev --ip 0.0.0.0 crash (empty error)

Kirim ke: https://github.com/cloudflare/workers-sdk/issues/new/choose (pilih "Bug Report")

---

**Judul (Title):**
`wrangler dev --ip 0.0.0.0` crashes after ~3 minutes with empty error (miniflare loopback) on macOS ARM

**Environment:**
- Wrangler: 4.118.0 (juga terjadi di 4.116.0)
- Node: v24.16.0 (juga terjadi di v26.3.0)
- OS: macOS ARM (Darwin Kernel 25.5.0, RELEASE_ARM64_T8112)
- Proyek: Cloudflare Worker dengan binding **D1 + Assets + [vars]**

**Describe the bug:**
`npx wrangler dev --port 8787 --ip 0.0.0.0` mematikan server lokal setelah ±2–3 menit dengan `✘ [ERROR]` yang **kosong** (tanpa pesan) dan proses keluar (koneksi ditolak setelahnya). Crash juga terjadi saat server idle (tanpa request).

**Temuan kunci:**
- `wrangler dev` **tanpa** `--ip` (localhost saja) → terkadang stabil, tapi juga bisa crash intermittent.
- `wrangler dev --ip <IP-spesifik>` (mis. `--ip 192.168.1.10`) → juga bisa crash intermittent.
- `wrangler dev --ip 0.0.0.0` (wildcard) → crash lebih cepat (±3 menit).
- **Crash bersifat intermittent** (~2–6 menit) — terjadi baik dengan Node v24 maupun v26, dengan/selain `--ip`, dan dalam kondisi proses bersih (tanpa instance wrangler lain). Bukan disebabkan kode aplikasi (worker minimal tanpa D1/Assets stabil 3+ menit).

→ Ini bug internal miniflare/workerd pada mesin macOS ARM.

**Stack trace dari log wrangler:**
```
Error
    at castErrorCause (.../wrangler/wrangler-dist/cli.js:178283:20)
    at ProxyController2.emitErrorEvent (.../cli.js:278284:20)
    at ProxyController2.onProxyWorkerMessage (.../cli.js:278161:18)
    at PROXY_CONTROLLER (.../cli.js:277890:24)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async #handleLoopbackCustomFetchService (.../miniflare/dist/src/index.js:113376:22)
    at async #handleLoopback (.../miniflare/dist/src/index.js:113604:20)
```
Baris `✘ [ERROR]` kosong (tidak ada message).

**Expected behavior:**
`wrangler dev --ip 0.0.0.0` seharusnya berjalan tanpa batas (dipakai untuk akses LAN dari HP/tablet).

**Actual behavior:**
Crash setelah ±3 menit dengan error kosong.

**Reproduction steps:**
1. Proyek Worker dengan `wrangler.toml` berisi `[[d1_databases]]`, `[assets]`, dan `[vars]`.
2. `npx wrangler dev --port 8787 --ip 0.0.0.0`
3. Tunggu ±3 menit (boleh idle). Server crash; log berisi `✘ [ERROR]` kosong + stack di `#handleLoopbackCustomFetchService`.

**Workaround saat ini:**
- Gunakan `--ip <IP-LAN-spesifik>` (bukan `0.0.0.0`), atau
- Omit `--ip` (localhost only).
