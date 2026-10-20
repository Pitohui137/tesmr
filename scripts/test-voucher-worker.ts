import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { SignJWT } from 'jose';
import app from '../server/worker';
import { normalizePhone, computeOrderTotals, maskPhone } from '../src/utils/loyalty';

// ---- D1 shim di atas node:sqlite
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync('server/schema.sql', 'utf8'));
function stmt(q: string, vals: any[] = []) {
  return {
    bind: (...v: any[]) => stmt(q, v),
    first: async () => (sqlite.prepare(q).get(...vals) as any) ?? null,
    run: async () => { const r = sqlite.prepare(q).run(...vals); return { success: true, meta: { changes: Number(r.changes) } }; },
    all: async () => ({ results: sqlite.prepare(q).all(...vals) as any[], success: true }),
  };
}
const DB: any = {
  prepare: (q: string) => stmt(q),
  batch: async (list: any[]) => { for (const s of list) await s.run(); return []; },
};
const SECRET = 'test-secret-test-secret-test-secret';
const env: any = { DB, JWT_SECRET: SECRET, ASSETS: { fetch: async () => new Response('x') } };

let pass = 0, fail = 0;
const ok = (cond: any, msg: string) => { if (cond) { pass++; console.log('  ok  ', msg); } else { fail++; console.log('  FAIL', msg); } };

async function call(method: string, path: string, body?: any, cookie?: string) {
  const res = await app.fetch(new Request('http://localhost' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

(async () => {
  // data awal
  sqlite.prepare("INSERT INTO settings (id,name,address,phone) VALUES (1,'Cafe','Jl. A','08123456789')").run();
  sqlite.prepare("INSERT INTO menu (id,name,category,price,description,created_at) VALUES ('m1','Kopi','minuman',20000,'',?)").run(new Date().toISOString());
  sqlite.prepare("INSERT INTO menu (id,name,category,price,description,created_at) VALUES ('m2','Nasi','makanan',30000,'',?)").run(new Date().toISOString());
  sqlite.prepare("INSERT INTO users (id,username,name,role,password,created_at) VALUES ('u1','kasir1','Kasir','kasir','x',?)").run(new Date().toISOString());
  const token = await new SignJWT({ userId: 'u1', username: 'kasir1', role: 'kasir' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(SECRET));
  const staff = `token=${token}`;

  console.log('# util');
  ok(normalizePhone('0812-3456-7890') === '081234567890', 'normalisasi 0812-3456-7890');
  ok(normalizePhone('+62 812 3456 7890') === '081234567890', 'normalisasi +62');
  ok(normalizePhone('6281234567890') === '081234567890', 'normalisasi 62...');
  ok(normalizePhone('12345') === '' && normalizePhone('abc') === '' && normalizePhone('') === '', 'nomor tidak valid ditolak');
  ok(maskPhone('081234567890') === '0812****7890', 'masking');

  console.log('# validasi nomor HP');
  const items = [{ menuId: 'm1', quantity: 2 }]; // 40.000
  let r = await call('POST', '/api/orders', { customerName: 'Budi', tableNumber: '1', items, paymentMethod: 'cash' });
  ok(r.status === 400, 'pesanan tanpa nomor HP ditolak (400)');
  r = await call('POST', '/api/orders', { customerName: 'Budi', customerPhone: '123', tableNumber: '1', items, paymentMethod: 'cash' });
  ok(r.status === 400, 'nomor HP tidak valid ditolak (400)');

  console.log('# 5 pesanan selesai -> voucher (default tiap 5, 10%, maks 25rb)');
  const phoneVariants = ['081234567890', '0812-3456-7890', '+6281234567890', '6281234567890', '081234567890'];
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    r = await call('POST', '/api/orders', { customerName: 'Budi', customerPhone: phoneVariants[i], tableNumber: '1', items, paymentMethod: 'cash' });
    ok(r.status === 201 && r.json.order.totalPrice === 40000 && r.json.order.discountAmount === 0, `pesanan #${i + 1} harga penuh`);
    ids.push(r.json.order.id);
    let st = await call('GET', '/api/loyalty/081234567890');
    ok(st.json.voucher === null, `  belum ada voucher sebelum pesanan #${i + 1} selesai`);
    for (const s of ['diproses', 'siap_diambil', 'selesai']) {
      const u = await call('PUT', `/api/orders/${r.json.order.id}/status`, { status: s }, staff);
      if (u.status !== 200) { ok(false, 'transisi ' + s + ' ' + JSON.stringify(u.json)); }
    }
  }
  let st = await call('GET', '/api/loyalty/0812-3456-7890');
  ok(st.status === 200 && st.json.voucher?.percent === 10 && st.json.completedOrders === 5, 'voucher 10% terbit setelah pesanan ke-5 selesai (format nomor berbeda dikenali sama)');
  const vcount = sqlite.prepare('SELECT COUNT(*) n FROM vouchers').get() as any;
  ok(vcount.n === 1, 'tepat 1 voucher di database');

  console.log('# voucher otomatis terpasang di pesanan berikutnya');
  const other = await call('GET', '/api/loyalty/081300000000');
  ok(other.json.voucher === null, 'nomor lain tidak punya voucher');
  r = await call('POST', '/api/orders', { customerName: 'Budi', customerPhone: '081234567890', tableNumber: '2', items, paymentMethod: 'qris' });
  ok(r.status === 201 && r.json.order.discountAmount === 4000 && r.json.order.totalPrice === 36000, 'diskon 10% dari 40.000 = 4.000, total 36.000');
  ok(r.json.order.voucherPercent === 10, 'order menyimpan persen voucher');
  const vOrder = r.json.order.id;
  st = await call('GET', '/api/loyalty/081234567890');
  ok(st.json.voucher === null, 'voucher langsung habis (terpakai) setelah dipakai');
  r = await call('POST', '/api/orders', { customerName: 'Budi', customerPhone: '081234567890', tableNumber: '2', items, paymentMethod: 'cash' });
  ok(r.json.order.discountAmount === 0 && r.json.order.totalPrice === 40000, 'pesanan berikutnya lagi harga penuh (voucher sekali pakai)');
  const fullOrder = r.json.order.id;

  console.log('# tambah item & batalkan item menjaga diskon konsisten');
  let a = await call('POST', `/api/orders/${vOrder}/items`, { items: [{ menuId: 'm2', quantity: 1 }], customerName: 'Budi', tableNumber: '2' });
  // belum diverifikasi -> item tambahan termasuk base: base 70.000 -> diskon 7.000
  ok(a.json.order.totalPrice === 63000 && a.json.order.discountAmount === 7000, 'tambah item sebelum bayar: diskon 10% dari 70.000, total 63.000');
  await call('PUT', `/api/orders/${vOrder}/status`, { status: 'diproses' }, staff);
  a = await call('POST', `/api/orders/${vOrder}/items`, { items: [{ menuId: 'm1', quantity: 1 }], customerName: 'Budi', tableNumber: '2' });
  ok(a.json.order.discountAmount === 7000 && a.json.order.additionalAmount === 20000 && a.json.order.totalPrice === 83000, 'item tambahan setelah bayar = harga penuh (diskon tetap 7.000)');
  const c1 = await call('PUT', `/api/orders/${vOrder}/items/m2/cancel`, undefined, staff);
  ok(c1.json.order.discountAmount === 4000 && c1.json.order.totalPrice === 56000, 'batalkan 1 item: diskon dihitung ulang (4.000), total 56.000');

  console.log('# pembatalan mengembalikan voucher');
  const cx = await call('PUT', `/api/orders/${vOrder}/cancel`, undefined, staff);
  ok(cx.status === 200, 'pesanan ber-voucher dibatalkan');
  st = await call('GET', '/api/loyalty/081234567890');
  ok(st.json.voucher?.percent === 10, 'voucher aktif kembali setelah pesanan dibatalkan');
  r = await call('POST', '/api/orders', { customerName: 'Budi', customerPhone: '081234567890', tableNumber: '3', items, paymentMethod: 'cash' });
  ok(r.json.order.discountAmount === 4000, 'voucher yang dipulihkan terpasang lagi di pesanan baru');
  const second = r.json.order.id;
  const del = await call('DELETE', `/api/orders/${second}`, undefined, staff);
  st = await call('GET', '/api/loyalty/081234567890');
  ok(del.status === 200 && st.json.voucher?.percent === 10, 'hapus pesanan ber-voucher juga memulihkan voucher');

  console.log('# batas maksimal potongan');
  r = await call('POST', '/api/orders', { customerName: 'Budi', customerPhone: '081234567890', tableNumber: '3', items: [{ menuId: 'm2', quantity: 20 }], paymentMethod: 'cash' }); // 600.000 -> 10% = 60.000, cap 25.000
  ok(r.json.order.discountAmount === 25000 && r.json.order.totalPrice === 575000, 'diskon dibatasi maks 25.000');

  console.log('# privasi');
  const pub = await call('GET', `/api/orders/${r.json.order.id}`);
  ok(pub.json.customerPhone === '0812****7890', 'GET publik pesanan menyamarkan nomor HP');
  const list = await call('GET', '/api/orders', undefined, staff);
  ok(list.json.some((o: any) => o.customerPhone === '081234567890'), 'staf melihat nomor HP lengkap');
  const bad = await call('GET', '/api/loyalty/abc');
  ok(bad.status === 400, 'cek loyalitas nomor tidak valid -> 400');
  const vs = await call('GET', '/api/vouchers');
  ok(vs.status === 401, 'daftar voucher butuh login staf');

  console.log('# pengaturan owner');
  const ownerTok = await new SignJWT({ userId: 'u2', username: 'own', role: 'owner' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(SECRET));
  const sv = await call('POST', '/api/settings', { name: 'Cafe', address: 'Jl. A', phone: '0812', loyaltyEnabled: true, loyaltyEvery: 3, loyaltyPercent: 20, loyaltyMaxDiscount: 0 }, `token=${ownerTok}`);
  ok(sv.status === 200, 'simpan pengaturan voucher');
  const gs = await call('GET', '/api/settings');
  ok(gs.json.loyaltyEvery === 3 && gs.json.loyaltyPercent === 20 && gs.json.loyaltyMaxDiscount === 0, 'pengaturan tersimpan & terbaca');
  await new Promise(r => setTimeout(r, 0));
  console.log(`\nHasil: ${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})();
