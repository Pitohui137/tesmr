import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { CafeSettings, MenuItem, Order, UserAccount, OrderItem, AppLog } from './src/types';
import { MENUS } from './server/menu-data';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

const app = express();
const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'database.sqlite');
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : 'dev-secret-do-not-use-in-production-' + Date.now());

// --- Logging System ---
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'error.log');

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {}
}

function logToFile(level: string, message: string, meta?: any) {
  ensureLogDir();
  const ts = new Date().toISOString();
  const entry = meta
    ? `${ts} [${level}] ${message} ${JSON.stringify(meta)}\n`
    : `${ts} [${level}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, entry);
  } catch {}
}

function logError(message: string, meta?: any) {
  console.error(`[${new Date().toISOString()}] [ERROR]`, message, meta || '');
  logToFile('ERROR', message, meta);
}

function logWarn(message: string, meta?: any) {
  console.warn(`[${new Date().toISOString()}] [WARN]`, message, meta || '');
  logToFile('WARN', message, meta);
}

function logInfo(message: string) {
  console.log(`[${new Date().toISOString()}] [INFO]`, message);
  logToFile('INFO', message);
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      logWarn(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`, { ip: req.ip });
      logApp(res.statusCode >= 500 ? 'ERROR' : 'WARN', `${req.method} ${req.originalUrl} -> ${res.statusCode}`, { ip: req.ip, status: res.statusCode });
    }
    trackRequest(req.ip, req.get('User-Agent') || '');
  });
  next();
});

const sqlite = new Database(DB_FILE);
sqlite.pragma('journal_mode = WAL');

// --- Backup & Disaster Recovery ---
const BACKUP_DIR = path.join(process.cwd(), 'backups');
const MAX_BACKUPS = 14;

function ensureBackupDir() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch {}
}

function createBackup(): string | null {
  try {
    ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupPath = path.join(BACKUP_DIR, `database-${stamp}.sqlite`);
    sqlite.exec(`VACUUM INTO '${backupPath}'`);
    logInfo(`Backup dibuat: ${backupPath}`);
    pruneOldBackups();
    return backupPath;
  } catch (err) {
    logError('Backup gagal', { message: (err as Error).message });
    return null;
  }
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('database-') && f.endsWith('.sqlite'))
      .sort();
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift();
      if (oldest) fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    }
  } catch {}
}

function scheduleBackups() {
  createBackup();
  const BACKUP_INTERVAL = 12 * 60 * 60 * 1000;
  setInterval(() => createBackup(), BACKUP_INTERVAL);
  logInfo(`Backup terjadwal tiap 12 jam (retensi ${MAX_BACKUPS} file)`);
}

// --- Daily Access Stats ---
interface DailyStat {
  date: string;
  requests: number;
  uniqueIps: string[];
  orders: number;
  mobile: number;
  desktop: number;
  tablet: number;
  bot: number;
  devices: { ip: string; device: string; isBot: boolean; count: number; lastSeen: string }[];
}

sqlite.exec(`CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  unique_ips TEXT NOT NULL DEFAULT '[]',
  orders INTEGER NOT NULL DEFAULT 0,
  mobile INTEGER NOT NULL DEFAULT 0,
  desktop INTEGER NOT NULL DEFAULT 0,
  tablet INTEGER NOT NULL DEFAULT 0,
  bot INTEGER NOT NULL DEFAULT 0,
  devices TEXT NOT NULL DEFAULT '[]'
)`);

try {
  const cols = sqlite.pragma("table_info(daily_stats)") as { name: string }[];
  if (!cols.some(c => c.name === 'devices')) {
    sqlite.exec(`ALTER TABLE daily_stats ADD COLUMN devices TEXT NOT NULL DEFAULT '[]'`);
  }
} catch {}

const upsertStatStmt = sqlite.prepare(`INSERT OR REPLACE INTO daily_stats (date, requests, unique_ips, orders, mobile, desktop, tablet, bot, devices)
  VALUES (@date, @requests, @unique_ips, @orders, @mobile, @desktop, @tablet, @bot, @devices)`);
const selectStatStmt = sqlite.prepare(`SELECT date, requests, unique_ips, orders, mobile, desktop, tablet, bot, devices FROM daily_stats WHERE date = ?`);

let cachedDailyStats: DailyStat | null = null;
let statsSaveTimer: NodeJS.Timeout | null = null;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function getTodayStat(): DailyStat {
  const today = todayKey();
  if (cachedDailyStats && cachedDailyStats.date === today) return cachedDailyStats;
  const row = selectStatStmt.get(today) as any;
  cachedDailyStats = row
    ? {
        date: row.date, requests: row.requests,
        uniqueIps: JSON.parse(row.unique_ips || '[]'), orders: row.orders,
        mobile: row.mobile || 0, desktop: row.desktop || 0,
        tablet: row.tablet || 0, bot: row.bot || 0,
        devices: (() => { try { return JSON.parse(row.devices || '[]'); } catch { return []; } })(),
      }
    : { date: today, requests: 0, uniqueIps: [], orders: 0, mobile: 0, desktop: 0, tablet: 0, bot: 0, devices: [] };
  return cachedDailyStats;
}

function trackRequest(ip: string, ua?: string) {
  const stat = getTodayStat();
  const cls = classifyUa(ua || '');
  const label = deviceLabel(ua || '');
  const ts = new Date().toISOString();
  stat.requests += 1;
  if (cls.device === 'mobile') stat.mobile += 1;
  else if (cls.device === 'tablet') stat.tablet += 1;
  else stat.desktop += 1;
  if (cls.isBot) stat.bot += 1;
  if (ip && !stat.uniqueIps.includes(ip)) {
    stat.uniqueIps.push(ip);
  }
  const ent = stat.devices.find((x) => x.ip === ip);
  if (ent) { ent.count += 1; ent.lastSeen = ts; ent.device = label; ent.isBot = ent.isBot || cls.isBot; }
  else { stat.devices.push({ ip, device: label, isBot: cls.isBot, count: 1, lastSeen: ts }); }
  if (statsSaveTimer) return;
  statsSaveTimer = setTimeout(() => {
    statsSaveTimer = null;
    const s = getTodayStat();
    upsertStatStmt.run({ date: s.date, requests: s.requests, unique_ips: JSON.stringify(s.uniqueIps), orders: s.orders, mobile: s.mobile, desktop: s.desktop, tablet: s.tablet, bot: s.bot, devices: JSON.stringify(s.devices) });
  }, 5000);
}

function trackOrder() {
  const stat = getTodayStat();
  stat.orders += 1;
  const s = getTodayStat();
  upsertStatStmt.run({ date: s.date, requests: s.requests, unique_ips: JSON.stringify(s.uniqueIps), orders: s.orders, mobile: s.mobile, desktop: s.desktop, tablet: s.tablet, bot: s.bot, devices: JSON.stringify(s.devices) });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi 15 menit.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Terlalu banyak request. Coba lagi nanti.' }
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
// Rate limit hanya untuk request tulis. GET publik (menu, settings, status
// pesanan) bebas agar banyak pelanggan di WiFi yang sama tidak terblokir.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  apiLimiter(req, res, next);
});

function cachedJson(req: express.Request, res: express.Response, data: any) {
  const etag = '"' + crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16) + '"';
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return true;
  }
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.json(data);
  return false;
}

const SALT_ROUNDS = 10;

const defaultSettings: CafeSettings = {
  name: "Salad Yook",
  address: "Jl. Pemuda No. 34, Majalengka Kulon, Kec. Majalengka, Kabupaten Majalengka",
  phone: "0812-3456-7890",
  qrisMerchantName: "SALAD YOOK",
  qrisCodeText: "00020101021226590016ID1020304050607080215ID1234567890123520459995303360540510.005802ID5923SALAD YOOK6007BANDUNG61054011562070703A016304A7B8"
};

const hashPassword = (password: string) => bcrypt.hashSync(password, SALT_ROUNDS);

// Sandi awal dibuat acak (nilai asli ada di file lokal .credentials.local - TIDAK di repo)
const defaultUsers: UserAccount[] = [
  { id: 'user-owner', username: 'owner', name: 'owner', role: 'owner', password: '$2b$10$p.yISoiM.v0KPpJQlf3jW.78Nlcic6XOkNayErbiIGUIZIiApfAQG', createdAt: new Date().toISOString() },
  { id: 'user-kasir-1', username: 'kasir', name: 'kasir', role: 'kasir', password: '$2b$10$QmC0VfhmaiAfDDS7QWbMYuo0UGp4qc.NSWb3b9cGPg12OsfQ3noFC', createdAt: new Date().toISOString() },
  { id: 'user-admin', username: 'admin', name: 'Admin (Monitoring)', role: 'admin', password: '$2b$10$ZodUhUpwvki8in.ZDkwTQexyC23WGHRnyfjwkce3q6BnGwsFO4Gnq', createdAt: new Date().toISOString() }
];

const getMockDate = (daysAgo: number, hour: number, minute: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

const defaultMenu: MenuItem[] = MENUS;

const defaultOrders: Order[] = [
  {
    id: "ORD-9821",
    customerName: "Rian",
    tableNumber: "3",
    items: [
      { menuId: 'menu-1', name: "Nasi Goreng Kecombrang", price: 32000, quantity: 2 },
      { menuId: 'menu-4', name: "Kopi Susu Pandan Hijau", price: 20000, quantity: 2 }
    ],
    totalPrice: 104000,
    paymentMethod: 'qris',
    status: 'selesai',
    createdAt: getMockDate(0, 9, 15)
  },
  {
    id: "ORD-9822",
    customerName: "Siti",
    tableNumber: "5",
    items: [
      { menuId: 'menu-2', name: "Spaghetti Pesto Emerald", price: 38000, quantity: 1 },
      { menuId: 'menu-3', name: "Matcha Espresso Latte", price: 26000, quantity: 1 },
      { menuId: 'menu-5', name: "Croissant Matcha Almond", price: 24000, quantity: 1 }
    ],
    totalPrice: 88000,
    paymentMethod: 'cash',
    status: 'selesai',
    createdAt: getMockDate(0, 10, 30)
  },
  {
    id: "ORD-9823",
    customerName: "Dedi",
    tableNumber: "2",
    items: [
      { menuId: 'menu-4', name: "Kopi Susu Pandan Hijau", price: 20000, quantity: 1 },
      { menuId: 'menu-6', name: "Singkong Crispy Garlic", price: 18000, quantity: 1 }
    ],
    totalPrice: 38000,
    paymentMethod: 'qris',
    status: 'siap_diambil',
    createdAt: getMockDate(0, 11, 45)
  },
  {
    id: "ORD-9824",
    customerName: "Fajar",
    tableNumber: "8",
    items: [
      { menuId: 'menu-1', name: "Nasi Goreng Kecombrang", price: 32000, quantity: 1 },
      { menuId: 'menu-3', name: "Matcha Espresso Latte", price: 26000, quantity: 1 }
    ],
    totalPrice: 58000,
    paymentMethod: 'cash',
    status: 'menunggu_verifikasi',
    createdAt: new Date().toISOString()
  },
  {
    id: "ORD-9810",
    customerName: "Agus",
    tableNumber: "1",
    items: [
      { menuId: 'menu-1', name: "Nasi Goreng Kecombrang", price: 32000, quantity: 1 },
      { menuId: 'menu-4', name: "Kopi Susu Pandan Hijau", price: 20000, quantity: 1 }
    ],
    totalPrice: 52000,
    paymentMethod: 'qris',
    status: 'selesai',
    createdAt: getMockDate(1, 12, 10)
  },
  {
    id: "ORD-9811",
    customerName: "Clara",
    tableNumber: "4",
    items: [
      { menuId: 'menu-2', name: "Spaghetti Pesto Emerald", price: 38000, quantity: 2 },
      { menuId: 'menu-3', name: "Matcha Espresso Latte", price: 26000, quantity: 2 }
    ],
    totalPrice: 128000,
    paymentMethod: 'qris',
    status: 'selesai',
    createdAt: getMockDate(1, 14, 20)
  },
  {
    id: "ORD-9812",
    customerName: "Bayu",
    tableNumber: "6",
    items: [
      { menuId: 'menu-5', name: "Croissant Matcha Almond", price: 24000, quantity: 2 },
      { menuId: 'menu-6', name: "Singkong Crispy Garlic", price: 18000, quantity: 1 }
    ],
    totalPrice: 66000,
    paymentMethod: 'cash',
    status: 'selesai',
    createdAt: getMockDate(1, 16, 40)
  },
  {
    id: "ORD-9813",
    customerName: "Eka",
    tableNumber: "10",
    items: [
      { menuId: 'menu-1', name: "Nasi Goreng Kecombrang", price: 32000, quantity: 3 },
      { menuId: 'menu-4', name: "Kopi Susu Pandan Hijau", price: 20000, quantity: 3 }
    ],
    totalPrice: 156000,
    paymentMethod: 'qris',
    status: 'selesai',
    createdAt: getMockDate(1, 19, 15)
  },
  {
    id: "ORD-9801",
    customerName: "Gerry",
    tableNumber: "7",
    items: [
      { menuId: 'menu-2', name: "Spaghetti Pesto Emerald", price: 38000, quantity: 1 },
      { menuId: 'menu-3', name: "Matcha Espresso Latte", price: 26000, quantity: 2 }
    ],
    totalPrice: 90000,
    paymentMethod: 'qris',
    status: 'selesai',
    createdAt: getMockDate(2, 11, 0)
  },
  {
    id: "ORD-9802",
    customerName: "Hendra",
    tableNumber: "2",
    items: [
      { menuId: 'menu-1', name: "Nasi Goreng Kecombrang", price: 32000, quantity: 1 },
      { menuId: 'menu-5', name: "Croissant Matcha Almond", price: 24000, quantity: 1 }
    ],
    totalPrice: 56000,
    paymentMethod: 'cash',
    status: 'selesai',
    createdAt: getMockDate(2, 15, 30)
  },
  {
    id: "ORD-9790",
    customerName: "Indah",
    tableNumber: "9",
    items: [
      { menuId: 'menu-4', name: "Kopi Susu Pandan Hijau", price: 20000, quantity: 4 },
      { menuId: 'menu-6', name: "Singkong Crispy Garlic", price: 18000, quantity: 2 }
    ],
    totalPrice: 116000,
    paymentMethod: 'qris',
    status: 'selesai',
    createdAt: getMockDate(3, 13, 20)
  }
];

interface DBState {
  settings: CafeSettings;
  users: UserAccount[];
  menu: MenuItem[];
  orders: Order[];
  appLogs?: AppLog[];
}

let dbState: DBState = {
  settings: defaultSettings,
  users: defaultUsers,
  menu: defaultMenu,
  orders: defaultOrders,
  appLogs: []
};

function logApp(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: any) {
  const entry: AppLog = {
    id: Date.now(),
    level,
    message,
    meta: JSON.stringify(meta || {}),
    createdAt: new Date().toISOString()
  };
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  if (level === 'ERROR') console.error(`[LOG] [${level}] ${message}${suffix}`);
  else if (level === 'WARN') console.warn(`[LOG] [${level}] ${message}${suffix}`);
  else console.log(`[LOG] [${level}] ${message}${suffix}`);
  if (level === 'ERROR') logError(message, meta);
  else if (level === 'WARN') logWarn(message, meta);
  dbState.appLogs = dbState.appLogs || [];
  dbState.appLogs.push(entry);
  if (dbState.appLogs.length > 1000) {
    dbState.appLogs = dbState.appLogs.slice(-1000);
  }
  saveDB();
}

sqlite.exec(`CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL
)`);

const upsertStmt = sqlite.prepare('INSERT OR REPLACE INTO app_state (id, data) VALUES (1, ?)');
const selectStmt = sqlite.prepare('SELECT data FROM app_state WHERE id = 1');

function migratePasswords(users: UserAccount[]): UserAccount[] {
  return users.map(u => {
    if (u.password && !u.password.startsWith('$2')) {
      u.password = hashPassword(u.password);
    }
    return u;
  });
}

function loadDB() {
  try {
    const row = selectStmt.get() as { data: string } | undefined;
    if (row) {
      dbState = JSON.parse(row.data);
      dbState.users = migratePasswords(dbState.users);
      dbState.orders = (dbState.orders || []).map(o => ({
        ...o,
        status: (o.status as string) === 'siap_diantar' ? 'siap_diambil' : o.status,
        additionalAmount: o.additionalAmount || 0
      }));
      if (!dbState.appLogs) dbState.appLogs = [];
      saveDB();
    } else {
      saveDB();
    }
  } catch (err) {
    console.error("Failed to load database. Using defaults.", err);
  }
}

let saveTimer: NodeJS.Timeout | null = null;
let pendingSave = false;

function saveDB() {
  pendingSave = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (pendingSave) {
      pendingSave = false;
      try {
        upsertStmt.run(JSON.stringify(dbState));
      } catch (err) {
        console.error("Failed to save database.", err);
      }
    }
  }, 3000);
}

function flushDB() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingSave) {
    pendingSave = false;
    try {
      upsertStmt.run(JSON.stringify(dbState));
    } catch (err) {
      console.error("Failed to save database.", err);
    }
  }
}

function flushStats() {
  if (statsSaveTimer) {
    clearTimeout(statsSaveTimer);
    statsSaveTimer = null;
  }
  const s = getTodayStat();
  upsertStatStmt.run({ date: s.date, requests: s.requests, unique_ips: JSON.stringify(s.uniqueIps), orders: s.orders });
}

process.on('SIGINT', () => { flushStats(); flushDB(); process.exit(0); });
process.on('SIGTERM', () => { flushStats(); flushDB(); process.exit(0); });

const LEGACY_DB = path.join(process.cwd(), 'db.json');
if (fs.existsSync(LEGACY_DB)) {
  try {
    const existing = selectStmt.get() as { data: string } | undefined;
    if (!existing) {
      const legacyData = fs.readFileSync(LEGACY_DB, 'utf8');
      const parsed = JSON.parse(legacyData);
      if (parsed.settings && parsed.menu && parsed.orders) {
        if (parsed.users) {
          parsed.users = migratePasswords(parsed.users);
        }
        dbState = parsed;
        saveDB();
        console.log("[DB] Migrated data from legacy db.json to SQLite");
      }
    }
    fs.renameSync(LEGACY_DB, LEGACY_DB + '.backup');
  } catch (err) {
    console.error("[DB] Failed to migrate legacy db.json:", err);
  }
}

loadDB();

interface JwtPayload {
  userId: string;
  username: string;
  role: string;
}

function sanitizeUser(user: UserAccount) {
  const { password, ...safe } = user;
  return safe;
}

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesi telah habis. Silakan login ulang.' });
  }
}

function requireRole(...roles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user as JwtPayload;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini' });
    }
    next();
  };
}

function generateToken(user: UserAccount): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

const isPublicRead = (req: express.Request) => {
  if (req.method !== 'GET') return false;
  const publicReadPaths = ['/api/settings', '/api/menu', '/api/orders/events'];
  return publicReadPaths.some(p => req.path.startsWith(p));
};

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password harus diisi" });
  }

  const user = dbState.users.find(u => u.username === username);
  if (!user) {
    logApp('WARN', `Login gagal: username tidak ditemukan (${username})`, { ip: req.ip });
    return res.status(401).json({ error: "Username tidak ditemukan" });
  }

  if (!user.password) {
    return res.status(401).json({ error: "Password belum diatur" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    logApp('WARN', `Login gagal: password salah (${username})`, { ip: req.ip });
    return res.status(401).json({ error: "Password salah!" });
  }
  logApp('INFO', `Login sukses: ${username} (${user.role})`, { ip: req.ip });

  const token = generateToken(user);

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.json({ user: sanitizeUser(user), token });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
  res.json({ message: 'Logout berhasil' });
});

// Ganti sandi sendiri (owner/kasir/admin yang sedang login)
app.put('/api/auth/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const actor = (req as any).user as JwtPayload;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Sandi lama dan baru wajib diisi' });
  }
  if (String(newPassword).length < 3) {
    return res.status(400).json({ error: 'Sandi baru minimal 3 karakter' });
  }
  const userIndex = dbState.users.findIndex(u => u.id === actor.userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Akun tidak ditemukan' });
  }
  const ok = await bcrypt.compare(currentPassword, dbState.users[userIndex].password);
  if (!ok) {
    return res.status(400).json({ error: 'Sandi lama salah' });
  }
  dbState.users[userIndex].password = hashPassword(newPassword);
  saveDB();
  logApp('INFO', `Sandi diubah: ${dbState.users[userIndex].username}`);
  res.json({ message: 'Sandi berhasil diubah' });
});

app.get('/api/settings', (req, res) => {
  cachedJson(req, res, dbState.settings);
});

app.post('/api/settings', authMiddleware, requireRole('owner', 'admin'), (req, res) => {
  const { name, address, phone, qrisMerchantName, qrisCodeText, qrisImageUrl } = req.body;
  if (!name || !address || !phone) {
    return res.status(400).json({ error: "Semua data cafe utama harus diisi!" });
  }

  dbState.settings = { name, address, phone, qrisMerchantName, qrisCodeText, qrisImageUrl };
  saveDB();
  res.json({ message: "Pengaturan cafe berhasil diperbarui", settings: dbState.settings });
});

app.get('/api/menu', (req, res) => {
  cachedJson(req, res, dbState.menu);
});
app.post('/api/menu', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { name, category, price, description, imageUrl, isAvailable, variants } = req.body;
  if (!name || !category || price === undefined) {
    return res.status(400).json({ error: "Nama, kategori, dan harga harus diisi" });
  }

  const newItem: MenuItem = {
    id: `menu-${Date.now()}`,
    name,
    category,
    price: Number(price),
    description: description || "",
    imageUrl: imageUrl || "",
    isAvailable: isAvailable !== undefined ? isAvailable : true,
    createdAt: new Date().toISOString(),
    variants: Array.isArray(variants) && variants.length ? variants : undefined
  };

  dbState.menu.push(newItem);
  saveDB();
  notifyClientsRefresh();
  res.status(201).json({ message: "Menu berhasil ditambahkan", item: newItem });
});

app.put('/api/menu/:id', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id } = req.params;
  const { name, category, price, description, imageUrl, isAvailable, variants } = req.body;

  const itemIndex = dbState.menu.findIndex(m => m.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: "Menu tidak ditemukan" });
  }

  const user = (req as any).user as JwtPayload;
  if (user.role !== 'owner') {
    const current = dbState.menu[itemIndex];
    const originalKeys = { name: current.name, category: current.category, price: current.price, description: current.description, imageUrl: current.imageUrl, variants: current.variants };
    const changedKeys = { name, category, price, description: price !== undefined ? undefined : description, imageUrl, variants };
    if (Object.entries(changedKeys).some(([k, v]) => v !== undefined && JSON.stringify(v) !== JSON.stringify((originalKeys as any)[k]))) {
      return res.status(403).json({ error: 'Kasir hanya bisa mengubah status ketersediaan menu' });
    }
  }

  dbState.menu[itemIndex] = {
    ...dbState.menu[itemIndex],
    name: name || dbState.menu[itemIndex].name,
    category: category || dbState.menu[itemIndex].category,
    price: price !== undefined ? Number(price) : dbState.menu[itemIndex].price,
    description: description !== undefined ? description : dbState.menu[itemIndex].description,
    imageUrl: imageUrl !== undefined ? imageUrl : dbState.menu[itemIndex].imageUrl,
    isAvailable: isAvailable !== undefined ? isAvailable : dbState.menu[itemIndex].isAvailable,
    variants: variants !== undefined ? (Array.isArray(variants) && variants.length ? variants : undefined) : dbState.menu[itemIndex].variants
  };

  saveDB();
  notifyClientsRefresh();
  res.json({ message: "Menu berhasil diperbarui", item: dbState.menu[itemIndex] });
});

// Set stok per-varian (kasir/owner) — mis. Ice habis, Hot tersedia
app.put('/api/menu/:id/variant', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id } = req.params;
  const { label, isAvailable } = req.body;
  if (!label || typeof isAvailable !== 'boolean') {
    return res.status(400).json({ error: "Label dan status varian harus diisi" });
  }
  const itemIndex = dbState.menu.findIndex(m => m.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Menu tidak ditemukan" });
  }
  const item = dbState.menu[itemIndex];
  if (!item.variants || !item.variants.length) {
    return res.status(404).json({ error: "Varian tidak ditemukan" });
  }
  const v = item.variants.find(x => x.label === label);
  if (!v) {
    return res.status(404).json({ error: "Varian tidak ditemukan" });
  }
  v.isAvailable = isAvailable;
  saveDB();
  notifyClientsRefresh();
  res.json({ message: "Stok varian diperbarui", item: dbState.menu[itemIndex] });
});

app.delete('/api/menu/:id', authMiddleware, requireRole('owner', 'admin'), (req, res) => {
  const { id } = req.params;
  const itemIndex = dbState.menu.findIndex(m => m.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Menu tidak ditemukan" });
  }

  const deleted = dbState.menu.splice(itemIndex, 1);
  saveDB();
  notifyClientsRefresh();
  res.json({ message: "Menu berhasil dihapus", item: deleted[0] });
});

app.get('/api/users', authMiddleware, requireRole('owner', 'admin'), (req, res) => {
  const actor = (req as any).user as JwtPayload;
  const users = actor.role === 'admin' ? dbState.users : dbState.users.filter(u => u.role !== 'admin');
  res.json(users.map(sanitizeUser));
});

app.post('/api/users', authMiddleware, requireRole('owner', 'admin'), (req, res) => {
  const { username, name, role, email } = req.body;
  if (!username || !name || !role) {
    return res.status(400).json({ error: "Username, Nama Lengkap, dan Peran harus diisi" });
  }
  if (!['owner', 'kasir', 'admin'].includes(role)) {
    return res.status(400).json({ error: "Peran tidak valid. Gunakan owner, kasir, atau admin." });
  }
  const actor = (req as any).user as JwtPayload;
  if (role === 'admin' && actor.role !== 'admin') {
    return res.status(403).json({ error: "Hanya akun admin (godmode) yang dapat membuat akun admin" });
  }

  const exists = dbState.users.some(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Username sudah terdaftar!" });
  }

  const rawPassword = Math.random().toString(36).slice(-8);

  const newUser: UserAccount = {
    id: `user-${Date.now()}`,
    username: username.toLowerCase().replace(/\s+/g, ''),
    name,
    role,
    email: email || '',
    password: hashPassword(rawPassword),
    createdAt: new Date().toISOString()
  };

  dbState.users.push(newUser);
  saveDB();
  res.status(201).json({ message: "Akun staf berhasil ditambahkan", user: { ...sanitizeUser(newUser), _tempPassword: rawPassword } });
});

app.put('/api/users/:id', authMiddleware, requireRole('owner', 'admin'), (req, res) => {
  const { id } = req.params;
  const { name, role, username, email } = req.body;

  const userIndex = dbState.users.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "Akun tidak ditemukan" });
  }

  const actor = (req as any).user as JwtPayload;
  const targetRole = dbState.users[userIndex].role;
  if (actor.role !== 'admin' && (targetRole === 'admin' || role === 'admin')) {
    return res.status(403).json({ error: "Hanya akun admin (godmode) yang dapat mengelola akun admin" });
  }

  if (id === 'user-owner' && role && role !== 'owner') {
    return res.status(400).json({ error: "Peran Owner utama tidak bisa diubah" });
  }
  if (id === 'user-admin' && role && role !== 'admin') {
    return res.status(400).json({ error: "Peran Admin monitoring tidak bisa diubah" });
  }
  if (role && !['owner', 'kasir', 'admin'].includes(role)) {
    return res.status(400).json({ error: "Peran tidak valid. Gunakan owner, kasir, atau admin." });
  }

  if (username && username.toLowerCase() !== dbState.users[userIndex].username) {
    const exists = dbState.users.some(u => u.id !== id && u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      return res.status(400).json({ error: "Username sudah terdaftar!" });
    }
    dbState.users[userIndex].username = username.toLowerCase().replace(/\s+/g, '');
  }

  dbState.users[userIndex] = {
    ...dbState.users[userIndex],
    name: name || dbState.users[userIndex].name,
    role: role || dbState.users[userIndex].role,
    email: email !== undefined ? email : dbState.users[userIndex].email
  };

  saveDB();
  res.json({ message: "Akun staf berhasil diperbarui", user: sanitizeUser(dbState.users[userIndex]) });
});

app.put('/api/users/:id/password', authMiddleware, requireRole('owner', 'admin'), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const userIndex = dbState.users.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "Akun tidak ditemukan" });
  }

  const actor = (req as any).user as JwtPayload;
  if (actor.role !== 'admin' && dbState.users[userIndex].role === 'admin') {
    return res.status(403).json({ error: "Hanya akun admin (godmode) yang dapat mengganti password admin" });
  }

  if (!password || password.length < 3) {
    return res.status(400).json({ error: "Password minimal 3 karakter" });
  }

  dbState.users[userIndex].password = hashPassword(password);
  saveDB();
  res.json({ message: "Password berhasil diubah" });
});

app.delete('/api/users/:id', authMiddleware, requireRole('owner', 'admin'), (req, res) => {
  const { id } = req.params;
  if (id === 'user-owner' || id === 'user-admin') {
    return res.status(400).json({ error: "Akun utama tidak bisa dihapus!" });
  }

  const userIndex = dbState.users.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return res.status(404).json({ error: "Akun tidak ditemukan" });
  }

  const actor = (req as any).user as JwtPayload;
  if (actor.role !== 'admin' && dbState.users[userIndex].role === 'admin') {
    return res.status(403).json({ error: "Hanya akun admin (godmode) yang dapat menghapus akun admin" });
  }

  const deleted = dbState.users.splice(userIndex, 1);
  saveDB();
  res.json({ message: "Akun staf berhasil dihapus", user: sanitizeUser(deleted[0]) });
});

app.get('/api/orders', authMiddleware, requireRole('owner', 'kasir', 'admin'), (req, res) => {
  cachedJson(req, res, dbState.orders.filter(o => !o.archivedAt));
});

app.get('/api/logs', authMiddleware, requireRole('admin'), (req, res) => {
  const logs = (dbState.appLogs || []).slice().reverse().slice(0, 200);
  res.json(logs);
});

let clients: any[] = [];
app.get('/api/orders/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

function notifyClientsOfNewOrder(order: Order) {
  const payload = JSON.stringify({ type: 'NEW_ORDER', order });
  clients.forEach(c => c.write(`data: ${payload}\n\n`));
}

function notifyClientsOfStatusChange(orderId: string, status: string) {
  const payload = JSON.stringify({ type: 'STATUS_CHANGE', orderId, status });
  clients.forEach(c => c.write(`data: ${payload}\n\n`));
}

function notifyClientsRefresh() {
  const payload = JSON.stringify({ type: 'REFRESH' });
  clients.forEach(c => c.write(`data: ${payload}\n\n`));
}

app.post('/api/orders', (req, res) => {
  const { customerName, tableNumber, items, paymentMethod } = req.body;
  if (!customerName || !tableNumber || !items || !items.length || !paymentMethod) {
    return res.status(400).json({ error: "Semua data pesanan wajib diisi (Nama, Meja, Item, Metode Pembayaran)" });
  }

  let id = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  while (dbState.orders.some(o => o.id === id)) {
    id = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  const orderItems: OrderItem[] = items.map((ni: any) => {
    const m = dbState.menu.find(x => x.id === ni.menuId);
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

  const newOrder: Order = {
    id,
    customerName,
    tableNumber,
    items: orderItems,
    totalPrice: orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    paymentMethod,
    status: 'menunggu_verifikasi',
    additionalAmount: 0,
    createdAt: new Date().toISOString()
  };

  dbState.orders.push(newOrder);
  saveDB();
  trackOrder();
  notifyClientsOfNewOrder(newOrder);
  logApp('INFO', `Pesanan baru dibuat: ${id} (${customerName}, meja ${tableNumber})`, { orderId: id, table: tableNumber, total: newOrder.totalPrice, payment: paymentMethod });
  res.status(201).json({ message: "Pesanan berhasil dibuat!", order: newOrder });
});

// Public: pelanggan melihat status pesanan miliknya sendiri (tanpa membuka seluruh data)
app.get('/api/orders/:id', (req, res) => {
  const { id } = req.params;
  if (id === 'events') {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  const order = dbState.orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  res.json(order);
});

app.put('/api/orders/:id/status', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const orderIndex = dbState.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  if ((dbState.orders[orderIndex] as any).archivedAt) {
    return res.status(400).json({ error: "Pesanan sudah diarsipkan" });
  }

  const currentStatus = dbState.orders[orderIndex].status;
  const allowedTransitions: Record<string, string[]> = {
    menunggu_verifikasi: ['diproses', 'dibatalkan'],
    diproses: ['siap_diambil', 'dibatalkan'],
    siap_diambil: ['selesai', 'dibatalkan'],
    selesai: [],
    dibatalkan: [],
  };
  const allowed = allowedTransitions[currentStatus] || [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Transisi status tidak valid: ${currentStatus} -> ${status}` });
  }

  dbState.orders[orderIndex].status = status;
  if (status === 'selesai') {
    dbState.orders[orderIndex].additionalAmount = 0;
  }
  saveDB();
  notifyClientsOfStatusChange(id, status);
  const actor = ((req as any).user as JwtPayload)?.username || 'staff';
  logApp('INFO', `Status pesanan ${id}: ${currentStatus} -> ${status} (oleh ${actor})`, { orderId: id, from: currentStatus, to: status, by: actor });
  res.json({ message: `Status pesanan diperbarui menjadi ${status}`, order: dbState.orders[orderIndex] });
});

app.put('/api/orders/:id/items/:menuId/cancel', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id, menuId } = req.params;
  const variant = req.query.variant as string | undefined;

  const orderIndex = dbState.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  if ((dbState.orders[orderIndex] as any).archivedAt) {
    return res.status(400).json({ error: "Pesanan sudah diarsipkan" });
  }

  const order = dbState.orders[orderIndex];
  const itemIndex = order.items.findIndex(i => i.menuId === menuId && (i.variant || '') === (variant || '') && !i.isCancelled);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Item tidak ditemukan atau sudah dibatalkan" });
  }

  order.items[itemIndex] = {
    ...order.items[itemIndex],
    isCancelled: true,
    cancelledAt: new Date().toISOString()
  };

  order.totalPrice = order.items
    .filter(i => !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  order.additionalAmount = order.items
    .filter(i => i.isAdditional && !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  dbState.orders[orderIndex] = order;
  saveDB();
  notifyClientsOfStatusChange(id, order.status);
  res.json({ message: "Item berhasil dibatalkan", order });
});

app.put('/api/orders/:id/items/:menuId/uncancel', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id, menuId } = req.params;
  const variant = req.query.variant as string | undefined;

  const orderIndex = dbState.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  if ((dbState.orders[orderIndex] as any).archivedAt) {
    return res.status(400).json({ error: "Pesanan sudah diarsipkan" });
  }

  const order = dbState.orders[orderIndex];
  const itemIndex = order.items.findIndex(i => i.menuId === menuId && (i.variant || '') === (variant || '') && i.isCancelled);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Item tidak ditemukan atau tidak dibatalkan" });
  }

  order.items[itemIndex] = {
    ...order.items[itemIndex],
    isCancelled: false,
    cancelledAt: undefined
  };

  order.totalPrice = order.items
    .filter(i => !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  order.additionalAmount = order.items
    .filter(i => i.isAdditional && !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  dbState.orders[orderIndex] = order;
  saveDB();
  res.json({ message: "Item berhasil dipulihkan", order });
});

app.put('/api/orders/:id/cancel', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id } = req.params;

  const orderIndex = dbState.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  if ((dbState.orders[orderIndex] as any).archivedAt) {
    return res.status(400).json({ error: "Pesanan sudah diarsipkan" });
  }

  const order = dbState.orders[orderIndex];
  order.status = 'dibatalkan';
  order.items = order.items.map(i => ({ ...i, isCancelled: true, cancelledAt: new Date().toISOString() }));

  dbState.orders[orderIndex] = order;
  saveDB();
  notifyClientsOfStatusChange(id, 'dibatalkan');
  logApp('WARN', `Pesanan dibatalkan: ${id}`, { orderId: id });
  res.json({ message: "Pesanan berhasil dibatalkan", order });
});

app.delete('/api/orders/:id', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id } = req.params;

  const orderIndex = dbState.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  if ((dbState.orders[orderIndex] as any).archivedAt) {
    return res.status(400).json({ error: "Pesanan sudah diarsipkan" });
  }

  const deleted = dbState.orders.splice(orderIndex, 1);
  saveDB();
  res.json({ message: "Pesanan berhasil dihapus", order: deleted[0] });
});

app.delete('/api/orders/:id/items/:menuId', authMiddleware, requireRole('owner', 'kasir'), (req, res) => {
  const { id, menuId } = req.params;
  const variant = req.query.variant as string | undefined;

  const orderIndex = dbState.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  if ((dbState.orders[orderIndex] as any).archivedAt) {
    return res.status(400).json({ error: "Pesanan sudah diarsipkan" });
  }

  const order = dbState.orders[orderIndex];
  const itemIndex = order.items.findIndex(i => i.menuId === menuId && (i.variant || '') === (variant || ''));
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Item tidak ditemukan" });
  }

  order.items.splice(itemIndex, 1);

  order.totalPrice = order.items
    .filter(i => !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  order.additionalAmount = order.items
    .filter(i => i.isAdditional && !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  dbState.orders[orderIndex] = order;
  saveDB();
  res.json({ message: "Item berhasil dihapus", order });
});

app.post('/api/orders/:id/items', (req, res) => {
  const { id } = req.params;
  const { items, customerName, tableNumber } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: "Item harus diisi" });
  }

  const orderIndex = dbState.orders.findIndex(o => o.id === id);
  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan" });
  }
  if ((dbState.orders[orderIndex] as any).archivedAt) {
    return res.status(400).json({ error: "Pesanan sudah diarsipkan" });
  }

  const order = dbState.orders[orderIndex];

  let isStaff = false;
  let actor = 'customer';
  const token = req.cookies?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      isStaff = decoded.role === 'owner' || decoded.role === 'kasir' || decoded.role === 'admin';
      if (decoded.username) actor = decoded.username;
    } catch {}
  }

  if (!isStaff) {
    if (String(customerName || '').trim().toLowerCase() !== String(order.customerName || '').trim().toLowerCase()) {
      return res.status(403).json({ error: "Data pemesan tidak cocok dengan pesanan ini" });
    }
    if (String(tableNumber ?? '') !== String(order.tableNumber ?? '')) {
      return res.status(403).json({ error: "Nomor meja tidak cocok dengan pesanan ini" });
    }
    if (order.status !== 'menunggu_verifikasi' && order.status !== 'diproses') {
      return res.status(400).json({ error: "Pesanan sudah selesai dibuat dan tidak dapat ditambahkan lagi" });
    }
  }

  const isPaid = order.status !== 'menunggu_verifikasi';
  const itemsToAdd: OrderItem[] = [];
  for (const ni of items) {
    const menuItem = dbState.menu.find(m => m.id === ni.menuId);
    if (!menuItem) {
      return res.status(404).json({ error: `Menu dengan id ${ni.menuId} tidak ditemukan` });
    }
    if (!menuItem.isAvailable) {
      return res.status(400).json({ error: `${menuItem.name} sedang tidak tersedia` });
    }
    const quantity = Math.max(1, Math.floor(Number(ni.quantity) || 1));
    let name = menuItem.name;
    let price = menuItem.price;
    let variant: string | undefined;
    if (ni.variant && menuItem.variants && menuItem.variants.length) {
      const v = menuItem.variants.find((x: any) => x.label === ni.variant);
      if (v) {
        if (v.isAvailable === false) {
          return res.status(400).json({ error: `${menuItem.name} (${v.label}) sedang habis` });
        }
        variant = v.label;
        name = `${menuItem.name} (${v.label})`;
        price = v.price;
      }
    } else if (menuItem.variants && menuItem.variants.length) {
      const first = menuItem.variants[0];
      if (first.isAvailable === false) {
        return res.status(400).json({ error: `${menuItem.name} (${first.label}) sedang habis` });
      }
      variant = first.label;
      name = `${menuItem.name} (${first.label})`;
      price = first.price;
    }
    itemsToAdd.push({ menuId: menuItem.id, name, price, quantity, notes: ni.notes || '', isAdditional: isPaid, variant });
  }

  order.items.push(...itemsToAdd);

  order.totalPrice = order.items
    .filter(i => !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  order.additionalAmount = order.items
    .filter(i => i.isAdditional && !i.isCancelled)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  dbState.orders[orderIndex] = order;
  saveDB();
  notifyClientsOfStatusChange(id, order.status);
  logApp('INFO', `Item ditambahkan ke ${id} (oleh ${actor})`, { orderId: id, added: itemsToAdd.length, additional: order.additionalAmount });
  res.json({ message: "Item berhasil ditambahkan", order });
});

app.get('/api/stats', authMiddleware, requireRole('admin'), (req, res) => {
  const today = getTodayStat();
  const devices = [...today.devices].sort((a, b) => b.count - a.count).slice(0, 100);
  res.json({
    today: {
      date: today.date,
      requests: today.requests,
      uniqueVisitors: today.uniqueIps.length,
      orders: today.orders,
      mobile: today.mobile,
      desktop: today.desktop,
      tablet: today.tablet,
      bot: today.bot,
      devices
    }
  });
});

// Info server (khusus admin / godmode)
app.get('/api/info', authMiddleware, requireRole('admin'), (req, res) => {
  const maskSecret = (v?: string) =>
    !v ? 'BELUM DISET' : (v === 'salad-yook-dev-secret-ganti-di-produksi' ? 'DEFAULT (belum diganti!)' : 'Tersimpan (aman)');
  res.json({
    app: { name: 'salad-yook (Express)', version: '1.0.0', node: process.version, platform: process.platform, arch: process.arch },
    env: { APP_URL: process.env.APP_URL || '(kosong)', JWT_SECRET: maskSecret(JWT_SECRET) },
    serverTime: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    port: PORT,
    request: { ip: req.ip },
  });
});

app.get('/api/report', authMiddleware, requireRole('owner', 'admin'), (req, res) => {
  const { period, startDate, endDate } = req.query;

  let filteredOrders = dbState.orders;

  if (period === 'daily') {
    const today = new Date().toDateString();
    filteredOrders = dbState.orders.filter(o => new Date(o.createdAt).toDateString() === today);
  } else if (period === 'weekly') {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    filteredOrders = dbState.orders.filter(o => new Date(o.createdAt) >= weekStart);
  } else if (period === 'monthly') {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    filteredOrders = dbState.orders.filter(o => new Date(o.createdAt) >= monthStart);
  } else if (startDate && endDate) {
    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    filteredOrders = dbState.orders.filter(o => {
      const d = new Date(o.createdAt);
      return d >= start && d <= end;
    });
  }

  const completedOrders = filteredOrders.filter(o => o.status === 'selesai');
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const qrisRevenue = completedOrders.filter(o => o.paymentMethod === 'qris').reduce((sum, o) => sum + o.totalPrice, 0);
  const cashRevenue = completedOrders.filter(o => o.paymentMethod === 'cash').reduce((sum, o) => sum + o.totalPrice, 0);

  res.json({
    period: period || 'all',
    startDate: startDate || '',
    endDate: endDate || '',
    totalRevenue,
    totalOrders: filteredOrders.length,
    completedOrders: completedOrders.length,
    qrisRevenue,
    cashRevenue,
    orders: filteredOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logError('Unhandled error', { method: req.method, url: req.originalUrl, message: err?.message, stack: err?.stack });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Terjadi kesalahan internal server' });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Cafe Server] Running at http://localhost:${PORT}`);
    scheduleBackups();
  });
}

process.on('uncaughtException', (err) => {
  logError('UNCAUGHT EXCEPTION', { message: err?.message, stack: err?.stack });
  flushDB();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('UNHANDLED REJECTION', { reason: reason instanceof Error ? reason.message : reason });
});

startServer();
