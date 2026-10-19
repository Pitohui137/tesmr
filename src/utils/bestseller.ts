import type { MenuItem } from '../types';

// Best Seller otomatis: menu terlaris per kategori dalam N hari terakhir.
export const BEST_SELLER_DAYS = 30;
export const BEST_SELLER_PER_CATEGORY = 2; // maksimal badge per kategori
export const BEST_SELLER_MIN_QTY = 5;      // minimal terjual agar layak dapat badge
// Hanya pesanan yang sudah dibayar/diverifikasi yang dihitung.
export const BEST_SELLER_STATUSES = ['diproses', 'siap_diambil', 'selesai'];

interface SaleOrder {
  status: string;
  createdAt: string;
  items: { menuId: string; quantity: number; isCancelled?: boolean }[];
}

// Mengembalikan daftar id menu yang berstatus Best Seller otomatis.
export function computeAutoBestSellers(
  orders: SaleOrder[],
  menu: Pick<MenuItem, 'id' | 'category'>[],
  now = Date.now()
): string[] {
  const since = now - BEST_SELLER_DAYS * 86400000;
  const sold = new Map<string, number>();
  for (const o of orders) {
    if (!BEST_SELLER_STATUSES.includes(o.status)) continue;
    const t = Date.parse(o.createdAt);
    if (!(t >= since)) continue;
    for (const it of o.items || []) {
      if (it.isCancelled) continue;
      sold.set(it.menuId, (sold.get(it.menuId) || 0) + (Number(it.quantity) || 0));
    }
  }

  const byCategory = new Map<string, { id: string; qty: number }[]>();
  for (const m of menu) {
    const qty = sold.get(m.id) || 0;
    if (qty < BEST_SELLER_MIN_QTY) continue;
    const list = byCategory.get(m.category) || [];
    list.push({ id: m.id, qty });
    byCategory.set(m.category, list);
  }

  const result: string[] = [];
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.qty - a.qty);
    result.push(...list.slice(0, BEST_SELLER_PER_CATEGORY).map(x => x.id));
  }
  return result;
}
