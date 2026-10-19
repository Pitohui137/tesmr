import type { MenuItem, OrderEta } from '../types';

// Estimasi waktu penyiapan per item (menit), menurut kategori menu.
// Minuman 1 menit; makanan, kudapan, dan dessert masing-masing 3 menit.
export const MINUTES_PER_ITEM: Record<string, number> = {
  minuman: 1,
  makanan: 3,
  kudapan: 3,
  dessert: 3,
};
const DEFAULT_MINUTES = 3; // menu yang sudah dihapus / kategori tak dikenal

// Jumlah petugas yang mengerjakan pesanan secara bersamaan (barista/koki).
// 1 = pesanan dikerjakan berurutan. Naikkan jika cafe punya beberapa petugas.
export const KITCHEN_WORKERS = 1;

const MIN = 60000;

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

// ===== Antrean =====
export interface QueueOrder {
  id: string;
  status: string;
  items: EstimateItem[];
  createdAt: string;
  processedAt?: string;
  archivedAt?: string;
}

export interface QueueState {
  etas: Record<string, OrderEta>; // untuk pesanan berstatus 'diproses'
  busyUntil: number;              // kapan petugas paling awal bebas (epoch ms, minimal sekarang)
  inQueue: number;                // jumlah pesanan 'diproses'
}

const toMs = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

// Simulasi antrean: pesanan 'diproses' dikerjakan berurutan menurut waktu mulai (processedAt).
// Pesanan baru mulai setelah petugas bebas. Pesanan yang sudah lewat target tapi belum
// ditandai siap dianggap petugas masih sibuk sampai sekarang.
export function computeQueue(
  orders: QueueOrder[],
  menu: MenuItem[],
  now = Date.now(),
  workers = KITCHEN_WORKERS
): QueueState {
  const free: number[] = new Array(Math.max(1, workers)).fill(0);
  const active = orders
    .filter(o => o.status === 'diproses' && !o.archivedAt)
    .sort((a, b) => toMs(a.processedAt || a.createdAt) - toMs(b.processedAt || b.createdAt));

  const etas: Record<string, OrderEta> = {};
  active.forEach((o, idx) => {
    let w = 0;
    for (let i = 1; i < free.length; i++) if (free[i] < free[w]) w = i;
    const workMinutes = estimateMinutes(o.items, menu);
    const startAt = Math.max(toMs(o.processedAt || o.createdAt), free[w]);
    const readyAt = startAt + workMinutes * MIN;
    etas[o.id] = {
      workMinutes,
      waitMinutes: Math.max(0, Math.ceil((startAt - now) / MIN)),
      readyAt,
      ordersAhead: idx,
    };
    free[w] = Math.max(readyAt, now);
  });

  return { etas, busyUntil: Math.max(now, Math.min(...free)), inQueue: active.length };
}

// ETA satu pesanan. Pesanan 'menunggu_verifikasi' dihitung seolah dikonfirmasi sekarang.
export function getOrderEta(
  order: QueueOrder,
  queue: QueueState,
  menu: MenuItem[],
  now = Date.now()
): OrderEta | null {
  if (order.status === 'diproses') return queue.etas[order.id] ?? null;
  if (order.status !== 'menunggu_verifikasi') return null;
  const workMinutes = estimateMinutes(order.items, menu);
  return {
    workMinutes,
    waitMinutes: Math.max(0, Math.ceil((queue.busyUntil - now) / MIN)),
    readyAt: queue.busyUntil + workMinutes * MIN,
    ordersAhead: queue.inQueue,
  };
}
