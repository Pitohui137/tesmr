import { MenuItem } from '../types';

// Estimasi waktu penyiapan per item (menit), menurut kategori menu.
// Minuman 1 menit; makanan, kudapan, dan dessert masing-masing 3 menit.
export const MINUTES_PER_ITEM: Record<string, number> = {
  minuman: 1,
  makanan: 3,
  kudapan: 3,
  dessert: 3,
};
const DEFAULT_MINUTES = 3; // menu yang sudah dihapus / kategori tak dikenal

interface EstimateItem {
  menuId: string;
  quantity: number;
  isCancelled?: boolean;
}

// Total estimasi (menit) = jumlah (menit per item x qty), item dibatalkan tidak dihitung.
export function estimateMinutes(items: EstimateItem[], menu: MenuItem[]): number {
  const categoryOf = new Map(menu.map(m => [m.id, m.category as string]));
  return items.reduce((sum, it) => {
    if (it.isCancelled) return sum;
    const perItem = MINUTES_PER_ITEM[categoryOf.get(it.menuId) ?? ''] ?? DEFAULT_MINUTES;
    return sum + perItem * (Number(it.quantity) || 0);
  }, 0);
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
