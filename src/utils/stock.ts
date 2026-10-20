// Stok harian per menu.
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
  menu: { id: string; name: string; dailyStock?: number | null }[],
  used: Record<string, number>
): { name: string; remaining: number } | null {
  const want: Record<string, number> = {};
  for (const r of requested) want[r.menuId] = (want[r.menuId] || 0) + (Number(r.quantity) || 0);
  for (const [menuId, qty] of Object.entries(want)) {
    const m = menu.find(x => x.id === menuId);
    if (!m || m.dailyStock === null || m.dailyStock === undefined) continue;
    const remaining = Math.max(0, m.dailyStock - (used[menuId] || 0));
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
