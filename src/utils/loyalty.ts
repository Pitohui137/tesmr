// Voucher loyalitas berdasarkan nomor HP.
// Dipakai bersama oleh backend (Express & Worker) dan frontend, supaya hitungan diskon selalu sama.

export interface LoyaltyConfig {
  loyaltyEnabled: boolean;
  loyaltyEvery: number;        // voucher didapat tiap N pesanan selesai
  loyaltyPercent: number;      // besar diskon (%)
  loyaltyMaxDiscount: number;  // batas maksimal potongan (Rp), 0 = tanpa batas
}

export const LOYALTY_DEFAULTS: LoyaltyConfig = {
  loyaltyEnabled: true,
  loyaltyEvery: 5,
  loyaltyPercent: 10,
  loyaltyMaxDiscount: 25000,
};

// Ubah input apa pun (0812-3456-7890, +62 812 3456 7890, 62812...) menjadi format baku 08xxxxxxxxxx.
// Mengembalikan '' bila bukan nomor HP Indonesia yang valid.
export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('62')) d = '0' + d.slice(2);
  else if (d.startsWith('8')) d = '0' + d;
  if (!/^08\d{8,11}$/.test(d)) return '';
  return d;
}

// 081234567890 -> 0812****7890
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 8) return phone || '';
  return phone.slice(0, 4) + '*'.repeat(phone.length - 8) + phone.slice(-4);
}

export function sanitizeLoyaltyConfig(input: Partial<LoyaltyConfig> | undefined, fallback: LoyaltyConfig = LOYALTY_DEFAULTS): LoyaltyConfig {
  const every = Math.floor(Number(input?.loyaltyEvery));
  const pct = Math.floor(Number(input?.loyaltyPercent));
  const max = Math.floor(Number(input?.loyaltyMaxDiscount));
  return {
    loyaltyEnabled: input?.loyaltyEnabled === undefined ? fallback.loyaltyEnabled : !!input.loyaltyEnabled,
    loyaltyEvery: Number.isFinite(every) && every >= 1 ? Math.min(every, 100) : fallback.loyaltyEvery,
    loyaltyPercent: Number.isFinite(pct) && pct >= 1 ? Math.min(pct, 100) : fallback.loyaltyPercent,
    loyaltyMaxDiscount: Number.isFinite(max) && max >= 0 ? max : fallback.loyaltyMaxDiscount,
  };
}

export function computeDiscount(base: number, percent: number, maxDiscount: number): number {
  if (!percent || base <= 0) return 0;
  let d = Math.floor((base * percent) / 100);
  if (maxDiscount > 0) d = Math.min(d, maxDiscount);
  return Math.min(d, base);
}

interface PricedItem { price: number; quantity: number; isCancelled?: boolean; isAdditional?: boolean }

// Diskon hanya berlaku untuk item pesanan awal; item tambahan (setelah bayar) tetap harga penuh
// supaya selisih yang dibayar di kasir tidak berubah-ubah.
export function computeOrderTotals(items: PricedItem[], percent = 0, maxDiscount = 0) {
  const active = items.filter(i => !i.isCancelled);
  const subtotal = active.reduce((s, i) => s + i.price * i.quantity, 0);
  const base = active.filter(i => !i.isAdditional).reduce((s, i) => s + i.price * i.quantity, 0);
  const discount = computeDiscount(base, percent, maxDiscount);
  return { subtotal, discount, total: subtotal - discount };
}

// Progres menuju voucher berikutnya
export function loyaltyProgress(completedOrders: number, every: number) {
  const inCycle = completedOrders % every;
  return { inCycle, remaining: every - inCycle };
}

export interface Voucher {
  id: string;
  phone: string;
  percent: number;
  maxDiscount: number;
  status: 'aktif' | 'terpakai';
  sourceOrderId: string;
  usedOrderId?: string;
  createdAt: string;
  usedAt?: string;
}

// Respons GET /api/loyalty/:phone
export interface LoyaltyStatus {
  enabled: boolean;
  phone: string;
  completedOrders: number;
  every: number;
  remaining: number;
  voucher: { percent: number; maxDiscount: number } | null;
}
