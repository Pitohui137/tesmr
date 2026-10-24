import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { SignJWT, jwtVerify } from 'jose';
import { computeQueue, getOrderEta } from '../src/utils/estimate';
import { computeAutoBestSellers, BEST_SELLER_DAYS } from '../src/utils/bestseller';
import { computeStockUsed, dayStartMs, effectiveStockLimit, findStockShortage, parseDailyStock, parseStockBonus, stockMessage, todayKey } from '../src/utils/stock';
import { LOYALTY_DEFAULTS, computeOrderTotals, loyaltyProgress, maskPhone, normalizePhone, sanitizeLoyaltyConfig } from '../src/utils/loyalty';

// ====== Minimal D1 / Workers types ======
interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ASSETS: Fetcher;
  APP_URL?: string;
}

const APP_VERSION = '1.0.0';

// ====== Rate limit store (in-memory, cukup untuk 1 cafe) ======
const rateStore = new Map<string, { count: number; resetAt: number }>();

type Role = 'owner' | 'kasir' | 'admin';

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: Role;
  email: string;
  password: string;
  created_at: string;
}

interface SettingsRow {
  id: number;
  name: string;
  address: string;
  phone: string;
  qris_merchant_name: string;
  qris_code_text: string;
  qris_image_url: string;
  best_seller_auto?: number;
  loyalty_enabled?: number;
  loyalty_every?: number;
  loyalty_percent?: number;
  loyalty_max_discount?: number;
}

interface MenuRow {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  image_url: string;
  is_available: number;
  is_best_seller?: number;
  daily_stock?: number | null;
  stock_bonus?: number;
  stock_bonus_date?: string | null;
  stock_bonus_base?: number;
  variants: string;
  created_at: string;
}

interface OrderRow {
  id: string;
  customer_name: string;
  table_number: string;
  items: string;
  total_price: number;
  payment_method: string;
  status: string;
  additional_amount?: number;
  archived_at?: string | null;
  has_payment_proof?: number;
  processed_at?: string | null;
  created_at: string;
  customer_phone?: string;
  discount_amount?: number;
  voucher_id?: string | null;
  voucher_percent?: number;
  voucher_max?: number;
}

interface VoucherRow {
  id: string;
  phone: string;
  percent: number;
  max_discount: number;
  status: string;
  source_order_id: string;
  used_order_id?: string | null;
  created_at: string;
  used_at?: string | null;
}

type Variables = {
  user: { userId: string; username: string; role: Role };
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ====== Auth helpers ======
const encoder = new TextEncoder();

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string): Promise<string> {
  const iterations = 100000;
  const salt = randomSalt();
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2:${iterations}:${salt}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split(':');
  if (parts.length === 4 && parts[0] === 'pbkdf2') {
    const [, iterStr, salt, hash] = parts;
    const test = await pbkdf2(password, salt, parseInt(iterStr, 10));
    return test === hash;
  }
  return false;
}

function getSecret(env: Env): Uint8Array {
  return encoder.encode(env.JWT_SECRET);
}

async function signToken(user: { id: string; username: string; role: Role }, env: Env): Promise<string> {
  return new SignJWT({ userId: user.id, username: user.username, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret(env));
}

async function verifyToken(token: string, env: Env) {
  try {
    const { payload } = await jwtVerify(token, getSecret(env));
    return payload as { userId: string; username: string; role: Role };
  } catch {
    return null;
  }
}

// ====== Middleware ======
const loginLimiter = async (c: any, next: any) => {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const key = `login:${ip}`;
  const rec = rateStore.get(key);
  if (!rec || rec.resetAt < now) {
    rateStore.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    await next();
    return;
  }
  if (rec.count >= 10) {
    return c.json({ error: 'Terlalu banyak percobaan login. Coba lagi 15 menit.' }, 429);
  }
  rec.count += 1;
  await next();
};

const apiLimiter = async (c: any, next: any) => {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const key = `api:${ip}`;
  const rec = rateStore.get(key);
  if (!rec || rec.resetAt < now) {
    rateStore.set(key, { count: 1, resetAt: now + 60 * 1000 });
    await next();
    return;
  }
  if (rec.count >= 300) {
    return c.json({ error: 'Terlalu banyak request. Coba lagi nanti.' }, 429);
  }
  rec.count += 1;
  await next();
};

// Cek voucher per nomor HP bersifat publik (GET), jadi dibatasi agar nomor tidak bisa ditebak massal
const loyaltyLimiter = async (c: any, next: any) => {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const key = `loyalty:${ip}`;
  const rec = rateStore.get(key);
  if (!rec || rec.resetAt < now) {
    rateStore.set(key, { count: 1, resetAt: now + 60 * 1000 });
    await next();
    return;
  }
  if (rec.count >= 40) {
    return c.json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, 429);
  }
  rec.count += 1;
  await next();
};

const auth = async (c: any, next: any) => {
  const token = getCookie(c, 'token');
  if (!token) return c.json({ error: 'Silakan login terlebih dahulu' }, 401);
  const payload = await verifyToken(token, c.env);
  if (!payload) return c.json({ error: 'Sesi telah habis. Silakan login ulang.' }, 401);
  c.set('user', payload);
  await next();
};

const requireRole = (...roles: Role[]) => async (c: any, next: any) => {
  const user = c.get('user') as { role: Role };
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!roles.includes(user.role)) return c.json({ error: 'Anda tidak memiliki akses ke fitur ini' }, 403);
  await next();
};

// ====== Data mappers ======
function toMenu(m: MenuRow) {
  let variants: { label: string; price: number; isAvailable?: boolean }[] | undefined;
  if (m.variants) {
    try {
      variants = JSON.parse(m.variants);
      variants = variants.map(v => ({ ...v, isAvailable: v.isAvailable !== false }));
    } catch {}
  }
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    price: m.price,
    description: m.description,
    imageUrl: m.image_url,
    isAvailable: !!m.is_available,
    isBestSeller: !!m.is_best_seller,
    dailyStock: m.daily_stock ?? null,
    stockBonus: m.stock_bonus || 0,
    stockBonusDate: m.stock_bonus_date || undefined,
    stockBonusBase: m.stock_bonus_base || 0,
    createdAt: m.created_at,
    variants: variants && variants.length ? variants : undefined,
  };
}

function toOrder(o: OrderRow) {
  return {
    id: o.id,
    customerName: o.customer_name,
    tableNumber: o.table_number,
    items: JSON.parse(o.items),
    totalPrice: o.total_price,
    paymentMethod: o.payment_method,
    status: o.status,
    createdAt: o.created_at,
    additionalAmount: o.additional_amount || 0,
    archivedAt: o.archived_at || undefined,
    hasPaymentProof: !!o.has_payment_proof,
    processedAt: o.processed_at || undefined,
    customerPhone: o.customer_phone || undefined,
    discountAmount: o.discount_amount || 0,
    voucherId: o.voucher_id || undefined,
    voucherPercent: o.voucher_percent || 0,
    voucherMax: o.voucher_max || 0,
  };
}

// Versi publik pesanan: nomor HP disamarkan
function toPublicOrder(o: OrderRow) {
  const order = toOrder(o);
  return { ...order, customerPhone: order.customerPhone ? maskPhone(order.customerPhone) : undefined };
}

function computeAdditionalAmount(items: any[]): number {
  return items
    .filter((i: any) => i.isAdditional && !i.isCancelled)
    .reduce((s: number, i: any) => s + (i.price * i.quantity), 0);
}

function generateOrderId(): string {
  return `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  menunggu_verifikasi: ['diproses', 'dibatalkan'],
  diproses: ['siap_diambil', 'dibatalkan'],
  siap_diambil: ['selesai', 'dibatalkan'],
  selesai: [],
  dibatalkan: [],
};

function sanitizeUser(u: UserRow) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, email: u.email, createdAt: u.created_at };
}

// ====== In-memory cache (TTL) ======
// Mengurangi query D1 untuk data yang jarang berubah tapi sering dipoll.
// Untuk 1 cafe (isolate yang sama) ini sangat efektif.
const MENU_TTL = 5000;
const SETTINGS_TTL = 15000;
const ORDERS_TTL = 800;

const menuCache: { data: any[] | null; ts: number } = { data: null, ts: 0 };
const settingsCache: { data: any | null; ts: number } = { data: null, ts: 0 };
const ordersCache: { data: any[] | null; ts: number } = { data: null, ts: 0 };
const BEST_SELLER_TTL = 10 * 60 * 1000;
const bestSellerCache: { ids: Set<string> | null; ts: number } = { ids: null, ts: 0 };
const stockCache: { used: Record<string, number> | null; ts: number } = { used: null, ts: 0 };
const STOCK_TTL = 5000;

async function getMenuCached(db: D1Database): Promise<any[]> {
  if (menuCache.data && Date.now() - menuCache.ts < MENU_TTL) return menuCache.data;
  const rows = await db.prepare('SELECT * FROM menu ORDER BY created_at').all<MenuRow>();
  menuCache.data = rows.results.map(toMenu);
  menuCache.ts = Date.now();
  return menuCache.data;
}

function invalidateMenuCache() { menuCache.data = null; bestSellerCache.ids = null; }

// Best Seller otomatis: dihitung dari penjualan N hari terakhir, di-cache agar hemat query D1.
async function getBestSellerIds(db: D1Database, menu: any[]): Promise<Set<string>> {
  if (bestSellerCache.ids && Date.now() - bestSellerCache.ts < BEST_SELLER_TTL) return bestSellerCache.ids;
  const since = new Date(Date.now() - BEST_SELLER_DAYS * 86400000).toISOString();
  const rows = await db.prepare(
    "SELECT items, status, created_at FROM orders WHERE status IN ('diproses','siap_diambil','selesai') AND created_at >= ?"
  ).bind(since).all<{ items: string; status: string; created_at: string }>();
  const orders = rows.results.map(r => {
    let items: any[] = [];
    try { items = JSON.parse(r.items); } catch {}
    return { status: r.status, createdAt: r.created_at, items };
  });
  bestSellerCache.ids = new Set(computeAutoBestSellers(orders, menu));
  bestSellerCache.ts = Date.now();
  return bestSellerCache.ids;
}

// Menu untuk klien (pelanggan & dashboard): tambahkan penanda Best Seller otomatis bila diaktifkan.
// Pemakaian stok hari ini (dari pesanan). Versi segar dipakai untuk validasi, versi cache untuk tampilan menu.
async function getStockUsed(db: D1Database): Promise<Record<string, number>> {
  const now = Date.now();
  const rows = await db.prepare(
    "SELECT items, status, created_at FROM orders WHERE created_at >= ? AND status != 'dibatalkan'"
  ).bind(new Date(dayStartMs(now)).toISOString()).all<{ items: string; status: string; created_at: string }>();
  const orders = rows.results.map(r => {
    let items: any[] = [];
    try { items = JSON.parse(r.items); } catch {}
    return { status: r.status, createdAt: r.created_at, items };
  });
  return computeStockUsed(orders, now);
}

async function getStockUsedCached(db: D1Database): Promise<Record<string, number>> {
  if (stockCache.used && Date.now() - stockCache.ts < STOCK_TTL) return stockCache.used;
  stockCache.used = await getStockUsed(db);
  stockCache.ts = Date.now();
  return stockCache.used;
}

async function getMenuForClients(db: D1Database): Promise<any[]> {
  let menu = await getMenuCached(db);
  const settings = await getSettingsCached(db);
  if (settings.bestSellerAuto) {
    const ids = await getBestSellerIds(db, menu);
    menu = menu.map(m => (ids.has(m.id) ? { ...m, isAutoBestSeller: true } : m));
  }
  if (menu.some(m => effectiveStockLimit(m) !== null)) {
    const used = await getStockUsedCached(db);
    menu = menu.map(m => {
      const limit = effectiveStockLimit(m);
      return limit === null ? m : { ...m, stockRemaining: Math.max(0, limit - (used[m.id] || 0)) };
    });
  }
  return menu;
}

async function getSettingsCached(db: D1Database): Promise<any> {
  if (settingsCache.data && Date.now() - settingsCache.ts < SETTINGS_TTL) return settingsCache.data;
  const row = await db.prepare('SELECT * FROM settings WHERE id = 1').first<SettingsRow>();
  settingsCache.data = row
    ? {
        name: row.name, address: row.address, phone: row.phone,
        qrisMerchantName: row.qris_merchant_name, qrisCodeText: row.qris_code_text, qrisImageUrl: row.qris_image_url,
        bestSellerAuto: !!row.best_seller_auto,
        ...sanitizeLoyaltyConfig({
          loyaltyEnabled: row.loyalty_enabled === undefined || row.loyalty_enabled === null ? true : !!row.loyalty_enabled,
          loyaltyEvery: row.loyalty_every ?? undefined,
          loyaltyPercent: row.loyalty_percent ?? undefined,
          loyaltyMaxDiscount: row.loyalty_max_discount ?? undefined,
        }),
      }
    : { name: 'Mepet-Rumah', address: '', phone: '', qrisMerchantName: '', qrisCodeText: '', qrisImageUrl: '', bestSellerAuto: false, ...LOYALTY_DEFAULTS };
  settingsCache.ts = Date.now();
  return settingsCache.data;
}

function invalidateSettingsCache() { settingsCache.data = null; bestSellerCache.ids = null; }

async function getOrdersCached(db: D1Database): Promise<any[]> {
  if (ordersCache.data && Date.now() - ordersCache.ts < ORDERS_TTL) return ordersCache.data;
  const rows = await db.prepare('SELECT * FROM orders WHERE archived_at IS NULL ORDER BY created_at DESC').all<OrderRow>();
  ordersCache.data = rows.results.map(toOrder);
  ordersCache.ts = Date.now();
  return ordersCache.data;
}

function invalidateOrdersCache() { ordersCache.data = null; stockCache.used = null; }

// ====== Access tracking ======
function classifyUa(ua: string): { device: 'mobile' | 'desktop' | 'tablet'; isBot: boolean } {
  const s = (ua || '').toLowerCase();
  const isBot = /bot|crawl|spider|gptbot|claude|anthropic|openai|google-extended|gemini|playwright|headless|curl|python|postman|wget|java|node-fetch|axios|facebookexternalhit|duckduck|bingpreview|yandex|baiduspider|okhttp|preview/i.test(s);
  if (/ipad|tablet|playbook|silk|kindle/i.test(s)) return { device: 'tablet', isBot };
  if (/mobile|iphone|android|ipod|phone/i.test(s)) return { device: 'mobile', isBot };
  return { device: 'desktop', isBot };
}

function deviceLabel(ua: string): string {
  const s = (ua || '').toLowerCase();
  const bots: [RegExp, string][] = [
    [/googlebot|google-extended/i, 'Googlebot'], [/bingbot|bingpreview/i, 'Bingbot'],
    [/facebookexternalhit|facebook/i, 'Facebook'], [/twitterbot/i, 'Twitterbot'],
    [/gptbot|chatgpt/i, 'GPTBot'], [/claude/i, 'ClaudeBot'], [/anthropic/i, 'Anthropic'],
    [/openai/i, 'OpenAI'], [/gemini|bard/i, 'Google Gemini'], [/yandex/i, 'Yandex'],
    [/baiduspider/i, 'Baidu'], [/duckduck/i, 'DuckDuckGo'], [/telegrambot/i, 'Telegram']
  ];
  for (const [re, name] of bots) if (re.test(s)) return `${name} (bot)`;
  let os = 'Perangkat';
  if (s.includes('iphone')) os = 'iPhone';
  else if (s.includes('ipad')) os = 'iPad';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('mac os') || s.includes('macintosh')) os = 'macOS';
  else if (s.includes('windows')) os = 'Windows';
  else if (s.includes('linux')) os = 'Linux';
  let br = 'Browser';
  if (s.includes('edg/') || s.includes('edge')) br = 'Edge';
  else if (s.includes('chrome')) br = 'Chrome';
  else if (s.includes('firefox')) br = 'Firefox';
  else if (s.includes('safari') && !s.includes('chrome')) br = 'Safari';
  else if (s.includes('postman')) br = 'Postman';
  else if (s.includes('curl')) br = 'curl';
  else if (s.includes('python')) br = 'Python';
  else if (s.includes('okhttp')) br = 'OkHttp';
  return (os === 'Perangkat' && br === 'Browser') ? 'Browser lain' : `${os} • ${br}`;
}

async function trackRequest(c: any) {
  const date = new Date().toISOString().slice(0, 10);
  const ts = new Date().toISOString();
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const ua = c.req.header('User-Agent') || '';
  const cls = classifyUa(ua);
  const label = deviceLabel(ua);
  const row = await c.env.DB.prepare('SELECT * FROM daily_stats WHERE date = ?').bind(date).first();
  let devices: any[] = [];
  if (row) {
    try { devices = JSON.parse((row as any).devices || '[]'); } catch {}
  }
  const ent = devices.find((x: any) => x.ip === ip);
  if (ent) {
    ent.count += 1;
    ent.lastSeen = ts;
    ent.device = label;
    ent.isBot = ent.isBot || cls.isBot;
  } else {
    devices.push({ ip, device: label, isBot: cls.isBot, count: 1, lastSeen: ts });
  }
  const devicesStr = JSON.stringify(devices);
  if (!row) {
    await c.env.DB.prepare('INSERT INTO daily_stats (date, requests, unique_ips, orders, mobile, desktop, tablet, bot, devices) VALUES (?, 1, ?, 0, ?, ?, ?, ?, ?)')
      .bind(date, JSON.stringify([ip]),
        cls.device === 'mobile' ? 1 : 0,
        cls.device === 'desktop' ? 1 : 0,
        cls.device === 'tablet' ? 1 : 0,
        cls.isBot ? 1 : 0,
        devicesStr
      ).run();
    return;
  }
  const ips: string[] = JSON.parse(row.unique_ips || '[]');
  if (!ips.includes(ip)) ips.push(ip);
  await c.env.DB.prepare('UPDATE daily_stats SET requests = requests + 1, unique_ips = ?, mobile = mobile + ?, desktop = desktop + ?, tablet = tablet + ?, bot = bot + ?, devices = ? WHERE date = ?')
    .bind(JSON.stringify(ips),
      cls.device === 'mobile' ? 1 : 0,
      cls.device === 'desktop' ? 1 : 0,
      cls.device === 'tablet' ? 1 : 0,
      cls.isBot ? 1 : 0,
      devicesStr,
      date
    ).run();
}

async function trackOrder(c: any) {
  const date = new Date().toISOString().slice(0, 10);
  await c.env.DB.prepare(
    'INSERT INTO daily_stats (date, requests, unique_ips, orders) VALUES (?, 0, ?, 1) ' +
    'ON CONFLICT(date) DO UPDATE SET orders = orders + 1'
  ).bind(date, '[]').run();
}

// ====== Logging aplikasi (untuk pemantauan jarak jauh oleh admin) ======
async function logApp(c: any, level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: any) {
  const ts = new Date().toISOString();
  const metaStr = JSON.stringify(meta || {});
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  if (level === 'ERROR') console.error(`[${ts}] [${level}] ${message}${suffix}`);
  else if (level === 'WARN') console.warn(`[${ts}] [${level}] ${message}${suffix}`);
  else console.log(`[${ts}] [${level}] ${message}${suffix}`);
  try {
    await c.env.DB.prepare('INSERT INTO app_logs (level, message, meta, created_at) VALUES (?, ?, ?, ?)')
      .bind(level, message, metaStr, ts).run();
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM app_logs').first() as { n: number } | null;
    if (count && count.n > 1000) {
      await c.env.DB.prepare('DELETE FROM app_logs WHERE id NOT IN (SELECT id FROM app_logs ORDER BY id DESC LIMIT 1000)').run();
    }
  } catch (e) {
    // Logging tidak boleh mengganggu request utama
  }
}

// ====== Routes ======
// Paksa HTTPS di produksi (HTTP -> HTTPS redirect) supaya browser tidak
// menampilkan "Not secure". Lokal (localhost) tetap diizinkan.
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const host = url.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const proto = c.req.header('x-forwarded-proto') || url.protocol.replace(':', '');
  if (!isLocal && proto === 'http') {
    url.protocol = 'https:';
    return c.redirect(url.toString(), 308);
  }
  await next();
});

// Rate limit hanya untuk request tulis (POST/PUT/DELETE). GET publik (menu,
// settings, status pesanan) bebas agar banyak pelanggan di WiFi yang sama
// tidak terblokir saat polling.
app.use('/api/*', async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    await next();
    return;
  }
  await apiLimiter(c, next);
});
app.use('/api/*', async (c, next) => {
  await next();
  if (c.res && c.res.ok) {
    await trackRequest(c);
  }
});

// Header keamanan dasar untuk API (via c.header - TIDAK membungkus ulang
// body respons, karena membungkus respons aset/stream memicu crash workerd)
app.use('/api/*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  await next();
});

// Catat respon error (4xx/5xx) ke app_logs
app.use('/api/*', async (c, next) => {
  await next();
  if (c.res && c.res.status >= 400) {
    const method = c.req.method;
    const pathname = new URL(c.req.url).pathname;
    const level = c.res.status >= 500 ? 'ERROR' : 'WARN';
    await logApp(c, level, `${method} ${pathname} -> ${c.res.status}`, {
      ip: c.req.header('CF-Connecting-IP') || 'local',
      status: c.res.status,
    });
  }
});

// Tangani error tak terduga
app.onError(async (err, c) => {
  console.error('[unhandled]', err);
  try {
    await logApp(c, 'ERROR', `Unhandled error: ${err.message}`, { stack: String(err.stack || '').slice(0, 500) });
  } catch {}
  return c.json({ error: 'Terjadi kesalahan internal server' }, 500);
});

// ====== Voucher loyalitas (berdasarkan nomor HP) ======
async function completedOrdersOf(db: D1Database, phone: string): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_phone = ? AND status = 'selesai'").bind(phone).first<{ n: number }>();
  return r?.n || 0;
}

// Voucher aktif tertua milik nomor HP ini
async function findActiveVoucher(db: D1Database, phone: string): Promise<VoucherRow | null> {
  return db.prepare("SELECT * FROM vouchers WHERE phone = ? AND status = 'aktif' ORDER BY created_at LIMIT 1").bind(phone).first<VoucherRow>();
}

// Klaim voucher secara atomik (status 'aktif' -> 'terpakai'). false bila keduluan pesanan lain.
async function claimVoucher(db: D1Database, voucherId: string, orderId: string): Promise<boolean> {
  const r = await db.prepare("UPDATE vouchers SET status = 'terpakai', used_order_id = ?, used_at = ? WHERE id = ? AND status = 'aktif'")
    .bind(orderId, new Date().toISOString(), voucherId).run();
  return (r.meta?.changes ?? 0) > 0;
}

// Pesanan dibatalkan/dihapus -> voucher yang dipakainya kembali aktif
async function restoreVoucher(db: D1Database, order: OrderRow) {
  if (!order.voucher_id) return;
  await db.prepare("UPDATE vouchers SET status = 'aktif', used_order_id = NULL, used_at = NULL WHERE id = ? AND used_order_id = ?")
    .bind(order.voucher_id, order.id).run();
}

// Dipanggil setelah pesanan berstatus 'selesai': tiap kelipatan N pesanan selesai -> 1 voucher baru
async function issueVoucherIfEarned(c: any, order: OrderRow) {
  const phone = order.customer_phone;
  if (!phone) return;
  const cfg = sanitizeLoyaltyConfig(await getSettingsCached(c.env.DB));
  if (!cfg.loyaltyEnabled) return;
  const done = await completedOrdersOf(c.env.DB, phone);
  if (done <= 0 || done % cfg.loyaltyEvery !== 0) return;
  const id = `VCH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  // source_order_id UNIQUE + OR IGNORE => idempoten (tidak ganda walau dipanggil ulang)
  const r = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO vouchers (id, phone, percent, max_discount, status, source_order_id, created_at) VALUES (?, ?, ?, ?, 'aktif', ?, ?)"
  ).bind(id, phone, cfg.loyaltyPercent, cfg.loyaltyMaxDiscount, order.id, new Date().toISOString()).run();
  if ((r.meta?.changes ?? 0) > 0) {
    await logApp(c, 'INFO', `Voucher baru untuk ${maskPhone(phone)} (pesanan ${order.id})`, { orderId: order.id, percent: cfg.loyaltyPercent });
  }
}

// Publik: status loyalitas & voucher untuk satu nomor HP
app.get('/api/loyalty/:phone', loyaltyLimiter, async (c) => {
  const phone = normalizePhone(c.req.param('phone'));
  if (!phone) return c.json({ error: 'Nomor HP tidak valid' }, 400);
  const cfg = sanitizeLoyaltyConfig(await getSettingsCached(c.env.DB));
  const [completed, voucher] = await Promise.all([
    completedOrdersOf(c.env.DB, phone),
    cfg.loyaltyEnabled ? findActiveVoucher(c.env.DB, phone) : Promise.resolve(null),
  ]);
  return c.json({
    enabled: cfg.loyaltyEnabled,
    phone,
    completedOrders: completed,
    every: cfg.loyaltyEvery,
    remaining: loyaltyProgress(completed, cfg.loyaltyEvery).remaining,
    voucher: voucher ? { percent: voucher.percent, maxDiscount: voucher.max_discount } : null,
  });
});

// Staf: daftar voucher (untuk dashboard)
app.get('/api/vouchers', auth, requireRole('owner', 'kasir', 'admin'), async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM vouchers ORDER BY created_at DESC LIMIT 200').all<VoucherRow>();
  return c.json(rows.results.map(v => ({
    id: v.id, phone: v.phone, percent: v.percent, maxDiscount: v.max_discount, status: v.status,
    sourceOrderId: v.source_order_id, usedOrderId: v.used_order_id || undefined,
    createdAt: v.created_at, usedAt: v.used_at || undefined,
  })));
});

// Auth
app.post('/api/auth/login', loginLimiter, async (c) => {
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) return c.json({ error: 'Username dan password harus diisi' }, 400);

  const isLocal = c.req.url.includes('localhost') || c.req.url.includes('127.0.0.1');
  if (!isLocal && c.env.JWT_SECRET === 'mepet-rumah-dev-secret-ganti-di-produksi') {
    return c.json({ error: 'Server belum dikonfigurasi dengan benar (JWT_SECRET masih default). Jalankan: bash scripts/deploy-cloudflare.sh' }, 500);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();
  if (!user) {
    await logApp(c, 'WARN', `Login gagal: username tidak ditemukan (${username})`, { ip: c.req.header('CF-Connecting-IP') || 'local' });
    return c.json({ error: 'Username tidak ditemukan' }, 401);
  }
  if (!(await verifyPassword(password, user.password))) {
    await logApp(c, 'WARN', `Login gagal: password salah (${username})`, { ip: c.req.header('CF-Connecting-IP') || 'local' });
    return c.json({ error: 'Password salah!' }, 401);
  }
  await logApp(c, 'INFO', `Login sukses: ${username} (${user.role})`, { ip: c.req.header('CF-Connecting-IP') || 'local' });

  const token = await signToken({ id: user.id, username: user.username, role: user.role }, c.env);
  const isHttps = c.req.url.startsWith('https://');
  setCookie(c, 'token', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60,
    path: '/',
  });
  return c.json({ user: sanitizeUser(user), token });
});

app.post('/api/auth/logout', (c) => {
  deleteCookie(c, 'token', { path: '/' });
  return c.json({ message: 'Logout berhasil' });
});

// Ganti sandi sendiri (owner/kasir/admin yang sedang login)
app.put('/api/auth/password', auth, async (c) => {
  const { currentPassword, newPassword } = await c.req.json().catch(() => ({}));
  const actor = c.get('user') as { userId: string; username: string };
  if (!currentPassword || !newPassword) return c.json({ error: 'Sandi lama dan baru wajib diisi' }, 400);
  if (String(newPassword).length < 3) return c.json({ error: 'Sandi baru minimal 3 karakter' }, 400);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(actor.userId).first<UserRow>();
  if (!user) return c.json({ error: 'Akun tidak ditemukan' }, 404);
  if (!(await verifyPassword(currentPassword, user.password))) return c.json({ error: 'Sandi lama salah' }, 400);
  await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(await hashPassword(String(newPassword)), actor.userId).run();
  await logApp(c, 'INFO', `Sandi diubah: ${user.username}`);
  return c.json({ message: 'Sandi berhasil diubah' });
});

function isSecure(reqUrl: string): boolean {
  return reqUrl.startsWith('https://');
}

// Settings
app.get('/api/settings', async (c) => {
  return c.json(await getSettingsCached(c.env.DB));
});

app.post('/api/settings', auth, requireRole('owner', 'admin'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, address, phone, qrisMerchantName, qrisCodeText, qrisImageUrl, bestSellerAuto } = body;
  if (!name || !address || !phone) return c.json({ error: 'Semua data cafe utama harus diisi!' }, 400);
  const current = await getSettingsCached(c.env.DB);
  const autoFlag = bestSellerAuto === undefined ? !!current.bestSellerAuto : !!bestSellerAuto;
  const loy = sanitizeLoyaltyConfig(body, sanitizeLoyaltyConfig(current));
  await c.env.DB.prepare(
    'INSERT INTO settings (id, name, address, phone, qris_merchant_name, qris_code_text, qris_image_url, best_seller_auto, loyalty_enabled, loyalty_every, loyalty_percent, loyalty_max_discount) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET name = excluded.name, address = excluded.address, phone = excluded.phone, ' +
    'qris_merchant_name = excluded.qris_merchant_name, qris_code_text = excluded.qris_code_text, qris_image_url = excluded.qris_image_url, ' +
    'best_seller_auto = excluded.best_seller_auto, loyalty_enabled = excluded.loyalty_enabled, loyalty_every = excluded.loyalty_every, ' +
    'loyalty_percent = excluded.loyalty_percent, loyalty_max_discount = excluded.loyalty_max_discount'
  ).bind(name, address, phone, qrisMerchantName || '', qrisCodeText || '', qrisImageUrl || '', autoFlag ? 1 : 0,
    loy.loyaltyEnabled ? 1 : 0, loy.loyaltyEvery, loy.loyaltyPercent, loy.loyaltyMaxDiscount).run();
  invalidateSettingsCache();
  return c.json({ message: 'Pengaturan cafe berhasil diperbarui' });
});

// Menu
app.get('/api/menu', async (c) => {
  return c.json(await getMenuForClients(c.env.DB));
});

// Publik: beban antrean saat ini (untuk estimasi di halaman checkout pelanggan)
app.get('/api/queue', async (c) => {
  const now = Date.now();
  const [menu, all] = await Promise.all([getMenuCached(c.env.DB), getOrdersCached(c.env.DB)]);
  const q = computeQueue(all, menu, now);
  return c.json({ inQueue: q.inQueue, waitMinutes: Math.max(0, Math.ceil((q.busyUntil - now) / 60000)) });
});

app.post('/api/menu', auth, requireRole('owner', 'kasir'), async (c) => {
  const { name, category, price, description, imageUrl, isAvailable, isBestSeller, dailyStock, variants } = await c.req.json().catch(() => ({}));
  if (!name || !category || price === undefined) return c.json({ error: 'Nama, kategori, dan harga harus diisi' }, 400);
  const id = `menu-${Date.now()}`;
  const variantsStr = Array.isArray(variants) && variants.length ? JSON.stringify(variants) : '';
  await c.env.DB.prepare(
    'INSERT INTO menu (id, name, category, price, description, image_url, is_available, is_best_seller, daily_stock, variants, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, name, category, Number(price), description || '', imageUrl || '', isAvailable !== undefined ? (isAvailable ? 1 : 0) : 1, isBestSeller === true ? 1 : 0, parseDailyStock(dailyStock) ?? null, variantsStr, new Date().toISOString()).run();
  invalidateMenuCache();
  const row = await c.env.DB.prepare('SELECT * FROM menu WHERE id = ?').bind(id).first<MenuRow>();
  return c.json({ message: 'Menu berhasil ditambahkan', item: toMenu(row!) }, 201);
});

app.put('/api/menu/:id', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id } = c.req.param();
  const user = c.get('user') as { role: Role };
  const { name, category, price, description, imageUrl, isAvailable, isBestSeller, dailyStock, stockBonus, variants } = await c.req.json().catch(() => ({}));
  const stockValue = parseDailyStock(dailyStock);
  const bonusValue = parseStockBonus(stockBonus);

  const current = await c.env.DB.prepare('SELECT * FROM menu WHERE id = ?').bind(id).first<MenuRow>();
  if (!current) return c.json({ error: 'Menu tidak ditemukan' }, 404);

  if (user.role !== 'owner' && (name !== undefined || category !== undefined || price !== undefined || description !== undefined || imageUrl !== undefined || variants !== undefined || isBestSeller !== undefined || stockValue !== undefined)) {
    return c.json({ error: 'Kasir hanya bisa mengubah ketersediaan menu dan menambah stok darurat hari ini' }, 403);
  }

  // Menu tanpa batas harian: stok darurat dihitung "mulai sekarang", jadi catat jumlah terjual saat ini
  let bonusBase = 0;
  if (bonusValue !== undefined && bonusValue > 0) {
    const dailyAfter = stockValue !== undefined ? stockValue : (current.daily_stock ?? null);
    if (dailyAfter === null) bonusBase = (await getStockUsed(c.env.DB))[id] || 0;
  }

  const variantsStr = Array.isArray(variants) ? JSON.stringify(variants) : undefined;
  await c.env.DB.prepare(
    'UPDATE menu SET name = COALESCE(?, name), category = COALESCE(?, category), price = COALESCE(?, price), ' +
    'description = COALESCE(?, description), image_url = COALESCE(?, image_url), is_available = COALESCE(?, is_available), is_best_seller = COALESCE(?, is_best_seller), daily_stock = CASE WHEN ? = 1 THEN ? ELSE daily_stock END, stock_bonus = CASE WHEN ? = 1 THEN ? ELSE stock_bonus END, stock_bonus_date = CASE WHEN ? = 1 THEN ? ELSE stock_bonus_date END, stock_bonus_base = CASE WHEN ? = 1 THEN ? ELSE stock_bonus_base END, variants = COALESCE(?, variants) WHERE id = ?'
  ).bind(
    name ?? null, category ?? null,
    price !== undefined ? Number(price) : null,
    description ?? null, imageUrl ?? null,
    isAvailable !== undefined ? (isAvailable ? 1 : 0) : null,
    isBestSeller !== undefined ? (isBestSeller ? 1 : 0) : null,
    stockValue !== undefined ? 1 : 0, stockValue ?? null,
    bonusValue !== undefined ? 1 : 0, bonusValue ?? 0,
    bonusValue !== undefined ? 1 : 0, todayKey(),
    bonusValue !== undefined ? 1 : 0, bonusBase,
    variantsStr ?? null, id
  ).run();
  invalidateMenuCache();

  if (bonusValue !== undefined) {
    const before = current.stock_bonus_date === todayKey() ? (current.stock_bonus || 0) : 0;
    if (before !== bonusValue) {
      const actor = (c.get('user') as { username?: string })?.username || 'staff';
      await logApp(c, 'INFO', `Stok darurat hari ini ${current.name}: +${before} -> +${bonusValue} (oleh ${actor})`, { menuId: id, from: before, to: bonusValue, by: actor });
    }
  }

  const row = await c.env.DB.prepare('SELECT * FROM menu WHERE id = ?').bind(id).first<MenuRow>();
  return c.json({ message: 'Menu berhasil diperbarui', item: toMenu(row!) });
});

// Set stok per-varian (kasir/owner) — mis. Ice habis, Hot tersedia
app.put('/api/menu/:id/variant', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id } = c.req.param();
  const { label, isAvailable } = await c.req.json().catch(() => ({}));
  if (!label || typeof isAvailable !== 'boolean') return c.json({ error: 'Label dan status varian harus diisi' }, 400);
  const current = await c.env.DB.prepare('SELECT * FROM menu WHERE id = ?').bind(id).first<MenuRow>();
  if (!current) return c.json({ error: 'Menu tidak ditemukan' }, 404);
  let variants: any[] = [];
  try { variants = JSON.parse(current.variants || '[]'); } catch {}
  const v = variants.find((x: any) => x.label === label);
  if (!v) return c.json({ error: 'Varian tidak ditemukan' }, 404);
  v.isAvailable = isAvailable;
  await c.env.DB.prepare('UPDATE menu SET variants = ? WHERE id = ?').bind(JSON.stringify(variants), id).run();
  invalidateMenuCache();
  const row = await c.env.DB.prepare('SELECT * FROM menu WHERE id = ?').bind(id).first<MenuRow>();
  return c.json({ message: 'Stok varian diperbarui', item: toMenu(row!) });
});

app.delete('/api/menu/:id', auth, requireRole('owner', 'admin'), async (c) => {
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT * FROM menu WHERE id = ?').bind(id).first<MenuRow>();
  if (!row) return c.json({ error: 'Menu tidak ditemukan' }, 404);
  await c.env.DB.prepare('DELETE FROM menu WHERE id = ?').bind(id).run();
  invalidateMenuCache();
  return c.json({ message: 'Menu berhasil dihapus', item: toMenu(row) });
});

// Users
app.get('/api/users', auth, requireRole('owner', 'admin'), async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM users ORDER BY created_at').all<UserRow>();
  const actor = c.get('user') as { role: Role };
  const users = actor.role === 'admin' ? rows.results : rows.results.filter(u => u.role !== 'admin');
  return c.json(users.map(sanitizeUser));
});

app.post('/api/users', auth, requireRole('owner', 'admin'), async (c) => {
  const { username, name, role, email } = await c.req.json().catch(() => ({}));
  if (!username || !name || !role) return c.json({ error: 'Username, Nama Lengkap, dan Peran harus diisi' }, 400);
  const validRoles = ['owner', 'kasir', 'admin'];
  if (!validRoles.includes(role)) return c.json({ error: 'Peran tidak valid. Gunakan owner, kasir, atau admin.' }, 400);
  const actor = c.get('user') as { role: Role };
  if (role === 'admin' && actor.role !== 'admin') {
    return c.json({ error: 'Hanya akun admin (godmode) yang dapat membuat akun admin' }, 403);
  }

  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').bind(username).first();
  if (exists) return c.json({ error: 'Username sudah terdaftar!' }, 400);

  const rawPassword = Math.random().toString(36).slice(-8);
  const id = `user-${Date.now()}`;
  await c.env.DB.prepare('INSERT INTO users (id, username, name, role, email, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, String(username).toLowerCase().replace(/\s+/g, ''), name, role, email || '', await hashPassword(rawPassword), new Date().toISOString()).run();
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return c.json({ message: 'Akun staf berhasil ditambahkan', user: { ...sanitizeUser(row!), _tempPassword: rawPassword } }, 201);
});

app.put('/api/users/:id', auth, requireRole('owner', 'admin'), async (c) => {
  const { id } = c.req.param();
  const { name, role, username, email } = await c.req.json().catch(() => ({}));
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!user) return c.json({ error: 'Akun tidak ditemukan' }, 404);
  const actor = c.get('user') as { role: Role };
  if (actor.role !== 'admin' && (user.role === 'admin' || role === 'admin')) {
    return c.json({ error: 'Hanya akun admin (godmode) yang dapat mengelola akun admin' }, 403);
  }
  if (id === 'user-owner' && role && role !== 'owner') return c.json({ error: 'Peran Owner utama tidak bisa diubah' }, 400);
  if (id === 'user-admin' && role && role !== 'admin') return c.json({ error: 'Peran Admin monitoring tidak bisa diubah' }, 400);
  if (role && !['owner', 'kasir', 'admin'].includes(role)) return c.json({ error: 'Peran tidak valid. Gunakan owner, kasir, atau admin.' }, 400);

  if (username && String(username).toLowerCase() !== user.username) {
    const exists = await c.env.DB.prepare('SELECT id FROM users WHERE id != ? AND lower(username) = lower(?)').bind(id, username).first();
    if (exists) return c.json({ error: 'Username sudah terdaftar!' }, 400);
    await c.env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(String(username).toLowerCase().replace(/\s+/g, ''), id).run();
  }
  await c.env.DB.prepare('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), email = COALESCE(?, email) WHERE id = ?')
    .bind(name ?? null, role ?? null, email ?? null, id).run();
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return c.json({ message: 'Akun staf berhasil diperbarui', user: sanitizeUser(row!) });
});

app.put('/api/users/:id/password', auth, requireRole('owner', 'admin'), async (c) => {
  const { id } = c.req.param();
  const { password } = await c.req.json().catch(() => ({}));
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!user) return c.json({ error: 'Akun tidak ditemukan' }, 404);
  const actor = c.get('user') as { role: Role };
  if (actor.role !== 'admin' && user.role === 'admin') {
    return c.json({ error: 'Hanya akun admin (godmode) yang dapat mengganti password admin' }, 403);
  }
  if (!password || String(password).length < 3) return c.json({ error: 'Password minimal 3 karakter' }, 400);
  await c.env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(await hashPassword(String(password)), id).run();
  return c.json({ message: 'Password berhasil diubah' });
});

app.delete('/api/users/:id', auth, requireRole('owner', 'admin'), async (c) => {
  const { id } = c.req.param();
  if (id === 'user-owner' || id === 'user-admin') return c.json({ error: 'Akun utama tidak bisa dihapus!' }, 400);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!user) return c.json({ error: 'Akun tidak ditemukan' }, 404);
  const actor = c.get('user') as { role: Role };
  if (actor.role !== 'admin' && user.role === 'admin') {
    return c.json({ error: 'Hanya akun admin (godmode) yang dapat menghapus akun admin' }, 403);
  }
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ message: 'Akun staf berhasil dihapus', user: sanitizeUser(user) });
});

// Orders
app.get('/api/orders', auth, requireRole('owner', 'kasir', 'admin'), async (c) => {
  return c.json(await getOrdersCached(c.env.DB));
});

// Logs aplikasi (khusus admin)
app.get('/api/logs', auth, requireRole('admin'), async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM app_logs ORDER BY id DESC LIMIT 200').all<{ id: number; level: string; message: string; meta: string; created_at: string }>();
  return c.json(rows.results.map(r => ({ id: r.id, level: r.level, message: r.message, meta: r.meta, createdAt: r.created_at })));
});

app.post('/api/orders', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { customerName, tableNumber, items, paymentMethod } = body;
  if (!customerName || !tableNumber || !items || !items.length || !paymentMethod) {
    return c.json({ error: 'Semua data pesanan wajib diisi (Nama, Meja, Item, Metode Pembayaran)' }, 400);
  }
  const customerPhone = normalizePhone(body.customerPhone);
  if (!customerPhone) {
    return c.json({ error: 'Nomor HP wajib diisi dengan benar (contoh: 081234567890)' }, 400);
  }
  const menuRows = await getMenuCached(c.env.DB);
  const normItems = items.map((ni: any) => {
    const m = menuRows.find((x: any) => x.id === ni.menuId);
    if (!m) return { menuId: ni.menuId, name: ni.name || 'Unknown', price: Number(ni.price) || 0, quantity: Number(ni.quantity) || 1, notes: ni.notes || '', variant: ni.variant };
    let name = ni.name || m.name;
    let price = Number(ni.price) || m.price;
    let variant = ni.variant;
    if (ni.variant && m.variants && m.variants.length) {
      const v = m.variants.find((x: any) => x.label === ni.variant);
      if (v) { name = `${m.name} (${v.label})`; price = v.price; }
    }
    return { menuId: m.id, name, price, quantity: Number(ni.quantity) || 1, notes: ni.notes || '', variant };
  });

  // Stok harian: tolak jika melebihi sisa stok
  const stockLimited = normItems.some((i: any) => { const m = menuRows.find((x: any) => x.id === i.menuId); return !!m && effectiveStockLimit(m) !== null; });
  if (stockLimited) {
    const short = findStockShortage(normItems, menuRows, await getStockUsed(c.env.DB));
    if (short) return c.json({ error: stockMessage(short.name, short.remaining) }, 409);
  }

  // Voucher otomatis terpasang bila nomor HP ini punya voucher aktif
  let id = generateOrderId();
  const settings = sanitizeLoyaltyConfig(await getSettingsCached(c.env.DB));
  let voucher: VoucherRow | null = null;
  const claimedFor = id; // id pesanan saat voucher diklaim (bisa berganti bila insert harus diulang)
  if (settings.loyaltyEnabled) {
    const candidate = await findActiveVoucher(c.env.DB, customerPhone);
    if (candidate && await claimVoucher(c.env.DB, candidate.id, id)) voucher = candidate;
  }
  const totals = computeOrderTotals(normItems, voucher?.percent || 0, voucher?.max_discount || 0);
  const useVoucher = !!voucher && totals.discount > 0;
  if (voucher && !useVoucher) {
    await restoreVoucher(c.env.DB, { id, voucher_id: voucher.id } as OrderRow); // tidak ada potongan -> jangan habiskan voucher
    voucher = null;
  }

  const stmt = c.env.DB.prepare(
    'INSERT INTO orders (id, customer_name, table_number, items, total_price, payment_method, status, additional_amount, created_at, customer_phone, discount_amount, voucher_id, voucher_percent, voucher_max) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
  );
  const bindOrder = (oid: string) => stmt.bind(
    oid, customerName, tableNumber, JSON.stringify(normItems), totals.total, paymentMethod, 'menunggu_verifikasi', new Date().toISOString(),
    customerPhone, useVoucher ? totals.discount : 0, useVoucher ? voucher!.id : null, useVoucher ? voucher!.percent : 0, useVoucher ? voucher!.max_discount : 0
  );
  try {
    await bindOrder(id).run();
  } catch (e) {
    id = generateOrderId();
    try {
      await bindOrder(id).run();
    } catch (e2) {
      if (voucher) await restoreVoucher(c.env.DB, { id: claimedFor, voucher_id: voucher.id } as OrderRow);
      throw e2;
    }
    if (useVoucher) await c.env.DB.prepare('UPDATE vouchers SET used_order_id = ? WHERE id = ?').bind(id, voucher!.id).run();
  }
  if (stockLimited) {
    // Cek ulang setelah insert: bila dua pesanan masuk bersamaan dan stok terlampaui, batalkan yang terakhir
    const after = await getStockUsed(c.env.DB);
    const over = menuRows.find((m: any) => normItems.some((i: any) => i.menuId === m.id) && (after[m.id] || 0) > (effectiveStockLimit(m) ?? Infinity));
    if (over) {
      await c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();
      if (useVoucher) await restoreVoucher(c.env.DB, { id, voucher_id: voucher!.id } as OrderRow);
      invalidateOrdersCache();
      const own = normItems.filter((i: any) => i.menuId === over.id).reduce((s: number, i: any) => s + i.quantity, 0);
      return c.json({ error: stockMessage(over.name, Math.max(0, (effectiveStockLimit(over) ?? 0) - ((after[over.id] || 0) - own))) }, 409);
    }
  }
  await trackOrder(c);
  invalidateOrdersCache();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  await logApp(c, 'INFO', `Pesanan baru dibuat: ${id} (${customerName}, meja ${tableNumber})`, { orderId: id, table: tableNumber, total: totals.total, payment: paymentMethod, discount: useVoucher ? totals.discount : 0 });
  return c.json({ message: 'Pesanan berhasil dibuat!', order: toOrder(row!) }, 201);
});

// Public: pelanggan melihat status pesanan miliknya sendiri (tanpa membuka seluruh data)
app.get('/api/orders/:id', async (c) => {
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!row) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  const order = toOrder(row);
  if (order.status === 'diproses' || order.status === 'menunggu_verifikasi') {
    const now = Date.now();
    const [menu, all] = await Promise.all([getMenuCached(c.env.DB), getOrdersCached(c.env.DB)]);
    const queue = computeQueue([...all.filter((o: any) => o.id !== id), order], menu, now);
    return c.json({ ...toPublicOrder(row), eta: getOrderEta(order, queue, menu, now) });
  }
  return c.json(toPublicOrder(row));
});

// Bukti bayar QRIS: pelanggan mengunggah screenshot (data URL, dikompres di klien).
const PROOF_MAX_CHARS = 500_000;
const PROOF_REGEX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

app.post('/api/orders/:id/proof', async (c) => {
  const { id } = c.req.param();
  const { image } = await c.req.json().catch(() => ({}));
  if (typeof image !== 'string') return c.json({ error: 'Gambar bukti bayar wajib diisi' }, 400);
  if (image.length > PROOF_MAX_CHARS) return c.json({ error: 'Ukuran gambar terlalu besar, gunakan screenshot yang lebih kecil' }, 413);
  if (!PROOF_REGEX.test(image)) return c.json({ error: 'Format gambar tidak valid (gunakan JPG/PNG/WebP)' }, 400);
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);
  if (order.payment_method !== 'qris') return c.json({ error: 'Bukti bayar hanya untuk pembayaran QRIS' }, 400);
  if (order.status !== 'menunggu_verifikasi') return c.json({ error: 'Pesanan sudah diverifikasi, bukti bayar tidak dapat diubah' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO order_proofs (order_id, image, created_at) VALUES (?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET image = excluded.image, created_at = excluded.created_at')
      .bind(id, image, new Date().toISOString()),
    c.env.DB.prepare('UPDATE orders SET has_payment_proof = 1 WHERE id = ?').bind(id),
  ]);
  invalidateOrdersCache();
  await logApp(c, 'INFO', `Bukti bayar diunggah: ${id} (meja ${order.table_number})`, { orderId: id, table: order.table_number });
  return c.json({ message: 'Bukti bayar berhasil dikirim' });
});

// Kasir/owner melihat bukti bayar
app.get('/api/orders/:id/proof', auth, requireRole('owner', 'kasir', 'admin'), async (c) => {
  const { id } = c.req.param();
  const row = await c.env.DB.prepare('SELECT image, created_at FROM order_proofs WHERE order_id = ?').bind(id).first<{ image: string; created_at: string }>();
  if (!row) return c.json({ error: 'Bukti bayar belum diunggah' }, 404);
  c.header('Cache-Control', 'no-store');
  return c.json({ image: row.image, createdAt: row.created_at });
});

app.put('/api/orders/:id/status', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id } = c.req.param();
  const { status } = await c.req.json().catch(() => ({}));
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);
  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    return c.json({ error: `Transisi status tidak valid: ${order.status} -> ${status}` }, 400);
  }
  const additionalAmount = status === 'selesai' ? 0 : (order.additional_amount || 0);
  const processedAt = status === 'diproses' ? new Date().toISOString() : (order.processed_at || null);
  await c.env.DB.prepare('UPDATE orders SET status = ?, additional_amount = ?, processed_at = ? WHERE id = ?').bind(status, additionalAmount, processedAt, id).run();
  if (status === 'dibatalkan') await restoreVoucher(c.env.DB, order);
  if (status === 'selesai') await issueVoucherIfEarned(c, order);
  invalidateOrdersCache();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  const actor = (c.get('user') as { username?: string })?.username || 'staff';
  await logApp(c, 'INFO', `Status pesanan ${id}: ${order.status} -> ${status} (oleh ${actor})`, { orderId: id, from: order.status, to: status, by: actor });
  return c.json({ message: `Status pesanan diperbarui menjadi ${status}`, order: toOrder(row!) });
});

app.put('/api/orders/:id/cancel', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id } = c.req.param();
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);
  const items = JSON.parse(order.items).map((i: any) => ({ ...i, isCancelled: true, cancelledAt: new Date().toISOString() }));
  await c.env.DB.prepare('UPDATE orders SET status = ?, items = ? WHERE id = ?').bind('dibatalkan', JSON.stringify(items), id).run();
  await restoreVoucher(c.env.DB, order);
  invalidateOrdersCache();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  await logApp(c, 'WARN', `Pesanan dibatalkan: ${id}`, { orderId: id });
  return c.json({ message: 'Pesanan berhasil dibatalkan', order: toOrder(row!) });
});

app.delete('/api/orders/:id', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id } = c.req.param();
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);
  await restoreVoucher(c.env.DB, order);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM order_proofs WHERE order_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id),
  ]);
  invalidateOrdersCache();
  return c.json({ message: 'Pesanan berhasil dihapus', order: toOrder(order) });
});

// Item-level operations
app.put('/api/orders/:id/items/:menuId/cancel', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id, menuId } = c.req.param();
  const variant = c.req.query('variant') || undefined;
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);
  let items = JSON.parse(order.items);
  const idx = items.findIndex((i: any) => i.menuId === menuId && (i.variant || '') === (variant || '') && !i.isCancelled);
  if (idx === -1) return c.json({ error: 'Item tidak ditemukan atau sudah dibatalkan' }, 404);
  items[idx] = { ...items[idx], isCancelled: true, cancelledAt: new Date().toISOString() };
  const totals = computeOrderTotals(items, order.voucher_percent || 0, order.voucher_max || 0);
  const additionalAmount = computeAdditionalAmount(items);
  await c.env.DB.prepare('UPDATE orders SET items = ?, total_price = ?, discount_amount = ?, additional_amount = ? WHERE id = ?').bind(JSON.stringify(items), totals.total, totals.discount, additionalAmount, id).run();
  invalidateOrdersCache();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  return c.json({ message: 'Item berhasil dibatalkan', order: toOrder(row!) });
});

app.put('/api/orders/:id/items/:menuId/uncancel', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id, menuId } = c.req.param();
  const variant = c.req.query('variant') || undefined;
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);
  let items = JSON.parse(order.items);
  const idx = items.findIndex((i: any) => i.menuId === menuId && (i.variant || '') === (variant || '') && i.isCancelled);
  if (idx === -1) return c.json({ error: 'Item tidak ditemukan atau tidak dibatalkan' }, 404);
  if (order.status !== 'dibatalkan') {
    const menuRows = await getMenuCached(c.env.DB);
    const short = findStockShortage([{ menuId: items[idx].menuId, quantity: items[idx].quantity }], menuRows, await getStockUsed(c.env.DB));
    if (short) return c.json({ error: stockMessage(short.name, short.remaining) }, 409);
  }
  items[idx] = { ...items[idx], isCancelled: false, cancelledAt: undefined };
  const totals = computeOrderTotals(items, order.voucher_percent || 0, order.voucher_max || 0);
  const additionalAmount = computeAdditionalAmount(items);
  await c.env.DB.prepare('UPDATE orders SET items = ?, total_price = ?, discount_amount = ?, additional_amount = ? WHERE id = ?').bind(JSON.stringify(items), totals.total, totals.discount, additionalAmount, id).run();
  invalidateOrdersCache();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  return c.json({ message: 'Item berhasil dipulihkan', order: toOrder(row!) });
});

app.delete('/api/orders/:id/items/:menuId', auth, requireRole('owner', 'kasir'), async (c) => {
  const { id, menuId } = c.req.param();
  const variant = c.req.query('variant') || undefined;
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);
  const items = JSON.parse(order.items).filter((i: any) => !(i.menuId === menuId && (i.variant || '') === (variant || '')));
  const totals = computeOrderTotals(items, order.voucher_percent || 0, order.voucher_max || 0);
  const additionalAmount = computeAdditionalAmount(items);
  await c.env.DB.prepare('UPDATE orders SET items = ?, total_price = ?, discount_amount = ?, additional_amount = ? WHERE id = ?').bind(JSON.stringify(items), totals.total, totals.discount, additionalAmount, id).run();
  invalidateOrdersCache();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  return c.json({ message: 'Item berhasil dihapus', order: toOrder(row!) });
});

app.post('/api/orders/:id/items', async (c) => {
  const { id } = c.req.param();
  const { items, customerName, tableNumber } = await c.req.json().catch(() => ({}));
  if (!items || !items.length) return c.json({ error: 'Item harus diisi' }, 400);
  const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  if (!order) return c.json({ error: 'Pesanan tidak ditemukan' }, 404);
  if (order.archived_at) return c.json({ error: 'Pesanan sudah diarsipkan' }, 400);

  const token = getCookie(c, 'token');
  let isStaff = false;
  let actor = 'customer';
  if (token) {
    const payload = await verifyToken(token, c.env);
    isStaff = !!payload && (payload.role === 'owner' || payload.role === 'kasir' || payload.role === 'admin');
    if (payload) actor = payload.username;
  }

  if (!isStaff) {
    if (String(customerName || '').trim().toLowerCase() !== String(order.customer_name || '').trim().toLowerCase()) {
      return c.json({ error: 'Data pemesan tidak cocok dengan pesanan ini' }, 403);
    }
    if (String(tableNumber ?? '') !== String(order.table_number ?? '')) {
      return c.json({ error: 'Nomor meja tidak cocok dengan pesanan ini' }, 403);
    }
    if (order.status !== 'menunggu_verifikasi' && order.status !== 'diproses') {
      return c.json({ error: 'Pesanan sudah selesai dibuat dan tidak dapat ditambahkan lagi' }, 400);
    }
  }

  const current = JSON.parse(order.items);
  const menuRows = await getMenuCached(c.env.DB);
  const isPaid = order.status !== 'menunggu_verifikasi';
  const itemsToAdd: any[] = [];
  for (const ni of items) {
    const menuItem = menuRows.find((m: any) => m.id === ni.menuId);
    if (!menuItem) return c.json({ error: `Menu dengan id ${ni.menuId} tidak ditemukan` }, 404);
    if (!menuItem.isAvailable) return c.json({ error: `${menuItem.name} sedang tidak tersedia` }, 400);
    const quantity = Math.max(1, Math.floor(Number(ni.quantity) || 1));
    let name = menuItem.name;
    let price = menuItem.price;
    let variant: string | undefined;
    if (ni.variant && menuItem.variants && menuItem.variants.length) {
      const v = menuItem.variants.find((x: any) => x.label === ni.variant);
      if (v) {
        if (v.isAvailable === false) return c.json({ error: `${menuItem.name} (${v.label}) sedang habis` }, 400);
        variant = v.label;
        name = `${menuItem.name} (${v.label})`;
        price = v.price;
      }
    } else if (menuItem.variants && menuItem.variants.length) {
      const first = menuItem.variants[0];
      if (first.isAvailable === false) return c.json({ error: `${menuItem.name} (${first.label}) sedang habis` }, 400);
      variant = first.label;
      name = `${menuItem.name} (${first.label})`;
      price = first.price;
    }
    itemsToAdd.push({ menuId: menuItem.id, name, price, quantity, notes: ni.notes || '', isAdditional: isPaid, variant });
  }
  if (itemsToAdd.some((i: any) => { const m = menuRows.find((x: any) => x.id === i.menuId); return !!m && effectiveStockLimit(m) !== null; })) {
    const short = findStockShortage(itemsToAdd, menuRows, await getStockUsed(c.env.DB));
    if (short) return c.json({ error: stockMessage(short.name, short.remaining) }, 409);
  }
  itemsToAdd.forEach((ni: any) => current.push(ni));
  const totals = computeOrderTotals(current, order.voucher_percent || 0, order.voucher_max || 0);
  const additionalAmount = computeAdditionalAmount(current);
  await c.env.DB.prepare('UPDATE orders SET items = ?, total_price = ?, discount_amount = ?, additional_amount = ? WHERE id = ?').bind(JSON.stringify(current), totals.total, totals.discount, additionalAmount, id).run();
  invalidateOrdersCache();
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
  await logApp(c, 'INFO', `Item ditambahkan ke ${id} (oleh ${actor})`, { orderId: id, added: itemsToAdd.length, additional: additionalAmount });
  return c.json({ message: 'Item berhasil ditambahkan', order: toOrder(row!) });
});

// Report
app.get('/api/report', auth, requireRole('owner', 'admin'), async (c) => {
  const period = c.req.query('period') || 'all';
  const startDate = c.req.query('startDate') || '';
  const endDate = c.req.query('endDate') || '';
  const rows = await c.env.DB.prepare('SELECT * FROM orders').all<OrderRow>();
  let filtered = rows.results;

  if (period === 'daily') {
    const today = new Date().toDateString();
    filtered = filtered.filter(o => new Date(o.created_at).toDateString() === today);
  } else if (period === 'weekly') {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    filtered = filtered.filter(o => new Date(o.created_at) >= weekStart);
  } else if (period === 'monthly') {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    filtered = filtered.filter(o => new Date(o.created_at) >= monthStart);
  } else if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter(o => { const d = new Date(o.created_at); return d >= start && d <= end; });
  }

  const orders = filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const completed = orders.filter(o => o.status === 'selesai');
  const totalRevenue = completed.reduce((s, o) => s + o.total_price, 0);
  const qrisRevenue = completed.filter(o => o.payment_method === 'qris').reduce((s, o) => s + o.total_price, 0);
  const cashRevenue = completed.filter(o => o.payment_method === 'cash').reduce((s, o) => s + o.total_price, 0);

  return c.json({
    period, startDate, endDate,
    totalRevenue, totalOrders: orders.length,
    completedOrders: completed.length, qrisRevenue, cashRevenue,
    orders: orders.map(toOrder),
  });
});

// Stats (khusus admin / godmode)
app.get('/api/stats', auth, requireRole('admin'), async (c) => {
  const date = new Date().toISOString().slice(0, 10);
  const row = await c.env.DB.prepare('SELECT * FROM daily_stats WHERE date = ?').bind(date).first() as { requests: number; unique_ips: string; orders: number; mobile: number; desktop: number; tablet: number; bot: number; devices: string } | null;
  let devices: any[] = [];
  if (row) {
    try { devices = JSON.parse(row.devices || '[]'); } catch {}
  }
  devices.sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
  return c.json({
    today: {
      date,
      requests: row?.requests || 0,
      uniqueVisitors: row ? JSON.parse(row.unique_ips || '[]').length : 0,
      orders: row?.orders || 0,
      mobile: row?.mobile || 0,
      desktop: row?.desktop || 0,
      tablet: row?.tablet || 0,
      bot: row?.bot || 0,
      devices: devices.slice(0, 100),
    },
  });
});

// Info server/worker (khusus admin / godmode)
app.get('/api/info', auth, requireRole('admin'), async (c) => {
  const cf = (c.req.raw as any).cf || {};
  const maskSecret = (v?: string) =>
    !v ? 'BELUM DISET' : (v === 'mepet-rumah-dev-secret-ganti-di-produksi' ? 'DEFAULT (belum diganti!)' : 'Tersimpan (aman)');
  return c.json({
    app: { name: 'mepet-rumah', main: 'server/worker.ts', version: APP_VERSION, compatibilityDate: '2025-01-01' },
    bindings: ['DB (D1: mepetrumah-db)', 'ASSETS (statis)'],
    env: {
      APP_URL: (c.env as any).APP_URL || '(kosong)',
      JWT_SECRET: maskSecret(c.env.JWT_SECRET),
    },
    serverTime: new Date().toISOString(),
    request: {
      colo: cf.colo || null,
      city: cf.city || null,
      country: cf.country || null,
      region: cf.region || null,
      asn: cf.asn || null,
      asOrganization: cf.asOrganization || null,
      httpProtocol: cf.httpProtocol || null,
      tlsVersion: cf.tlsVersion || null,
      tlsCipher: cf.tlsCipher || null,
      clientTcpRtt: cf.clientTcpRtt || null,
      timezone: cf.timezone || null,
      bot: cf.botManagement ? { score: cf.botManagement.score, verifiedBot: cf.botManagement.verifiedBot } : null,
    },
  });
});

// Fallback: serve static assets (SPA)
app.all('*', async (c) => {
  const url = new URL(c.req.url);
  const pathname = url.pathname;
  if (pathname.startsWith('/api/')) {
    return c.json({ error: 'Endpoint tidak ditemukan' }, 404);
  }
  try {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res.ok) return res;
  } catch {}
  const index = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  return index;
});

export default app;
