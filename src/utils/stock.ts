// Stok harian per menu (+ tambahan stok khusus hari ini).
// Pemakaian stok DIHITUNG dari pesanan hari ini (bukan counter terpisah), sehingga
// otomatis kembali saat pesanan/item dibatalkan atau dihapus, dan otomatis reset tiap hari.
// Pesanan yang menunggu verifikasi tetap menahan stok sampai dibatalkan kasir.

// Pergantian hari mengikuti zona waktu cafe. 7 = WIB (UTC+7). Ubah jika di WITA (8) / WIT (9).
export const STOCK_TZ_OFFSET_HOURS = 7;

const HOUR = 3600000;
const DAY = 24 * HOUR;

// Awal hari ini (00:00 waktu cafe) dalam epoch ms
export function dayStartMs(now = Date.now()): number {
  const off = STOCK_TZ_OFFSET_HOURS * HOUR;
  return Math.floor((now + off) / DAY) * DAY - off;
}

interface UsageOrder {
  status: string;
  createdAt: string;
  items: { menuId: string; quantity: number; isCancelled?: boolean }[];
}

// Jumlah porsi per menuId yang sudah terpakai hari ini
export function computeStockUsed(orders: UsageOrder[], now = Date.now()): Record<string, number> {
  const start = dayStartMs(now);
  const used: Record<string, number> = {};
  for (const o of orders) {
    if (o.status === 'dibatalkan') continue;
    const t = Date.parse(o.createdAt);
    if (!(t >= start)) continue;
    for (const it of o.items || []) {
      if (it.isCancelled) continue;
      used[it.menuId] = (used[it.menuId] || 0) + (Number(it.quantity) || 0);
    }
  }
  return used;
}

// Sisa stok hari ini; null = tidak dibatasi
// Tanggal hari ini (YYYY-MM-DD) menurut zona waktu cafe
export function todayKey(now = Date.now()): string {
  return new Date(now + STOCK_TZ_OFFSET_HOURS * HOUR).toISOString().slice(0, 10);
}

interface StockLimitFields {
  dailyStock?: number | null;
  stockBonus?: number;
  stockBonusBase?: number;       // untuk menu tanpa batas harian: jumlah terjual saat stok darurat diatur
  stockBonusDate?: string | null;
}

// Tambahan stok yang masih berlaku: hanya jika dicatat HARI INI, otomatis hangus besok
export function stockBonusToday(m: StockLimitFields, now = Date.now()): number {
  return m.stockBonusDate === todayKey(now) ? Math.max(0, Number(m.stockBonus) || 0) : 0;
}

// Batas stok yang berlaku hari ini. null = tidak terbatas.
// - Ada batas harian: batas harian + stok darurat hari ini.
// - Tanpa batas harian: tidak terbatas, KECUALI kasir memasang stok darurat. Maka menu hanya tersedia
//   sebanyak stok darurat itu, dihitung dari saat stok darurat diatur (hangus besok -> kembali tidak terbatas).
export function effectiveStockLimit(m: StockLimitFields, now = Date.now()): number | null {
  const bonus = stockBonusToday(m, now);
  if (m.dailyStock === null || m.dailyStock === undefined) {
    if (bonus <= 0) return null;
    const base = m.stockBonusDate === todayKey(now) ? Math.max(0, Number(m.stockBonusBase) || 0) : 0;
    return base + bonus;
  }
  return m.dailyStock + bonus;
}

export function stockRemainingOf(dailyStock: number | null | undefined, used: number): number | null {
  if (dailyStock === null || dailyStock === undefined) return null;
  return Math.max(0, dailyStock - used);
}

export function stockMessage(name: string, remaining: number): string {
  return remaining <= 0
    ? `${name} sudah habis untuk hari ini`
    : `Stok ${name} tinggal ${remaining} porsi hari ini`;
}

// Cek apakah permintaan melebihi stok. Mengembalikan menu pertama yang kurang, atau null jika aman.
export function findStockShortage(
  requested: { menuId: string; quantity: number }[],
  menu: ({ id: string; name: string } & StockLimitFields)[],
  used: Record<string, number>
): { name: string; remaining: number } | null {
  const want: Record<string, number> = {};
  for (const r of requested) want[r.menuId] = (want[r.menuId] || 0) + (Number(r.quantity) || 0);
  for (const [menuId, qty] of Object.entries(want)) {
    const m = menu.find(x => x.id === menuId);
    const limit = m ? effectiveStockLimit(m) : null;
    if (!m || limit === null) continue;
    const remaining = Math.max(0, limit - (used[menuId] || 0));
    if (qty > remaining) return { name: m.name, remaining };
  }
  return null;
}

// Baca nilai stok dari input: undefined = tidak dikirim, null = tidak terbatas, angka >= 0
export function parseDailyStock(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

// Baca tambahan stok dari input: undefined = tidak dikirim, null/'' = 0 (hapus tambahan), angka >= 0
export function parseStockBonus(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100000, Math.max(0, Math.floor(n)));
}
