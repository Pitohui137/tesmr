import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'screenshots');
const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

fs.mkdirSync(OUT_DIR, { recursive: true });

async function serverUp() {
  try {
    const res = await fetch(`${BASE}/api/settings`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await serverUp()) return true;
    await new Promise(r => setTimeout(r, 800));
  }
  return false;
}

let serverProc = null;

async function startServer() {
  if (await serverUp()) return; // reuse already-running dev server
  serverProc = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  serverProc.stdout.on('data', d => { logs += d; });
  serverProc.stderr.on('data', d => { logs += d; });
  if (!(await waitForServer())) {
    serverProc.kill('SIGTERM');
    throw new Error('Server lokal tidak bisa dijalankan. Log:\n' + logs.slice(-2000));
  }
}

async function stopServer() {
  if (serverProc) {
    serverProc.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 800));
    serverProc = null;
  }
}

// Sandi hanya dari file lokal .credentials.local (TIDAK di commit) + optional env
// SCREENSHOT_KASIR_PASSWORD / SCREENSHOT_OWNER_PASSWORD bila sandi lokal sudah diganti.
// Jangan hardcode sandi di file ini.
function readCredentials() {
  const file = path.join(ROOT, '.credentials.local');
  const creds = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.trim().match(/^(\w+):\s*(\S+)\s*$/);
      if (m) creds[m[1]] = m[2];
    }
  } catch {}
  return creds;
}

function staffPasswords(role, creds) {
  const list = [];
  if (creds[role]) list.push(creds[role]);
  const envKey = `SCREENSHOT_${role.toUpperCase()}_PASSWORD`;
  if (process.env[envKey]) list.push(process.env[envKey]);
  return list;
}

async function loginStaff(page, role, passwords) {
  for (const password of passwords) {
    await page.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.fill('input[type="text"]', role);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'Masuk Ke Dashboard' }).click();
    try {
      await page.waitForSelector('input[type="password"]', { state: 'detached', timeout: 8000 });
      return true;
    } catch {}
  }
  return false;
}

async function openCustomerMenu(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}/?table=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="text"]', { timeout: 15000 });
  await page.fill('input[type="text"]', 'Budi Santoso');
  await page.getByRole('button', { name: 'Lihat Menu & Pesan' }).click();
  await page.waitForSelector('text=Semua Menu', { timeout: 15000 });
  await page.waitForSelector('button:has-text("+ Tambah")', { timeout: 15000 });
  await page.waitForTimeout(1200); // tunggu animasi staggered selesai
}

async function capture() {
  const browser = await chromium.launch();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });

  try {
    // 1. Halaman menu customer — desktop
    const cPage = await desktop.newPage();
    await openCustomerMenu(cPage, { width: 1440, height: 900 });
    await cPage.screenshot({ path: path.join(OUT_DIR, 'customer-menu.png'), fullPage: true });
    console.log('✓ customer-menu.png');

    // 2. Halaman menu customer — mobile (viewport natural, bukan fullPage biar rapih)
    const mPage = await mobile.newPage();
    await openCustomerMenu(mPage, { width: 390, height: 844 });
    await mPage.screenshot({ path: path.join(OUT_DIR, 'customer-menu-mobile.png') });
    console.log('✓ customer-menu-mobile.png');

    // 3. Login kasir / owner
    const sPage = await desktop.newPage();
    await sPage.goto(`${BASE}/staff`, { waitUntil: 'domcontentloaded' });
    await sPage.waitForSelector('text=Masuk Ke Dashboard', { timeout: 15000 });
    await sPage.waitForTimeout(400);
    await sPage.screenshot({ path: path.join(OUT_DIR, 'cashier-login.png'), fullPage: true });
    console.log('✓ cashier-login.png');

    const creds = readCredentials();

    // 4. Dashboard kasir (bagian kasir) — login via UI agar sessionStorage terisi
    const kPage = await desktop.newPage();
    const kasirPasswords = staffPasswords('kasir', creds);
    if (await loginStaff(kPage, 'kasir', kasirPasswords)) {
      await kPage.waitForSelector('text=Kasir Dashboard', { timeout: 10000 });
      await kPage.waitForTimeout(800);
      await kPage.screenshot({ path: path.join(OUT_DIR, 'cashier-dashboard.png') });
      console.log('✓ cashier-dashboard.png');
    } else {
      console.log('⚠ Login kasir gagal — dashboard kasir dilewati (set SCREENSHOT_KASIR_PASSWORD jika sandi lokal sudah diganti).');
    }

    // 5. QR Code Meja (barcode untuk memesan) — login owner
    const oPage = await desktop.newPage();
    const ownerPasswords = staffPasswords('owner', creds);
    if (await loginStaff(oPage, 'owner', ownerPasswords)) {
      await oPage.waitForSelector('button:has-text("QR Code Meja")', { timeout: 10000 });
      await oPage.getByRole('button', { name: 'QR Code Meja' }).click();
      await oPage.waitForSelector('img[src*="qrserver"]', { timeout: 15000 });
      try {
        await oPage.waitForFunction(
          () => {
            const imgs = [...document.querySelectorAll('img[src*="qrserver"]')];
            return imgs.length > 0 && imgs.every(img => img.complete && img.naturalWidth > 0);
          },
          { timeout: 15000 }
        );
      } catch {
        console.log('⚠ QR code belum selesai dimuat (butuh internet) — tetap di-capture.');
      }
      await oPage.waitForTimeout(600);
      const qrPanel = oPage.locator('div.space-y-4:has(h2:text("Generate QR Code Meja"))');
      await qrPanel.screenshot({ path: path.join(OUT_DIR, 'table-qr-codes.png') });
      console.log('✓ table-qr-codes.png');
    } else {
      console.log('⚠ Login owner gagal — QR Code Meja dilewati (set SCREENSHOT_OWNER_PASSWORD jika sandi lokal sudah diganti).');
    }
  } finally {
    await desktop.close();
    await mobile.close();
  }

  // 6. GIF alur order (opsional; butuh ffmpeg)
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  } catch {
    console.log('⚠ ffmpeg tidak ditemukan — GIF dilewati.');
    await browser.close();
    return;
  }

  const videoDir = path.join(OUT_DIR, '.video-tmp');
  const gifCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  try {
    const gifPage = await gifCtx.newPage();
    await gifPage.goto(`${BASE}/?table=1`, { waitUntil: 'domcontentloaded' });
    await gifPage.waitForSelector('input[type="text"]', { timeout: 15000 });
    await gifPage.fill('input[type="text"]', 'Budi Santoso');
    await gifPage.getByRole('button', { name: 'Lihat Menu & Pesan' }).click();
    await gifPage.waitForSelector('button:has-text("+ Tambah")', { timeout: 15000 });
    await gifPage.waitForTimeout(700);
    const addButtons = gifPage.getByRole('button', { name: '+ Tambah' });
    if (await addButtons.count() > 0) await addButtons.first().click(); // fly-to-cart
    await gifPage.waitForTimeout(800);
    if (await addButtons.count() > 1) await addButtons.nth(1).click();
    await gifPage.waitForTimeout(700);
    await gifPage.getByRole('button', { name: /Bayar & Pesan/ }).click(); // buka drawer
    await gifPage.waitForTimeout(1200);
    await gifPage.getByRole('button', { name: /Konfirmasi Pesanan|Meja|close|Tutup/i }).first().click().catch(() => { });
    await gifPage.waitForTimeout(600);
  } finally {
    await gifCtx.close();
  }

  const videoFile = fs.readdirSync(videoDir).find(f => f.endsWith('.webm'));
  if (videoFile) {
    const webm = path.join(videoDir, videoFile);
    const gif = path.join(OUT_DIR, 'order-flow.gif');
    let ss = '2';
    try {
      const probe = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${webm}"`,
        { encoding: 'utf8' }
      ).trim();
      const dur = parseFloat(probe);
      if (Number.isFinite(dur) && dur > 16) ss = (dur - 13).toFixed(2);
    } catch { }
    execSync(
      `ffmpeg -y -ss ${ss} -t 13 -i "${webm}" -vf "fps=12,scale=390:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 "${gif}"`,
      { stdio: ['ignore', 'ignore', 'inherit'] }
    );
    console.log('✓ order-flow.gif');
  }
  fs.rmSync(videoDir, { recursive: true, force: true });

  await browser.close();
}

try {
  await startServer();
  await capture();
  console.log('\nSelesai! Screenshot ada di folder screenshots/.');
} catch (err) {
  console.error('Gagal:', err.message || err);
  process.exitCode = 1;
} finally {
  await stopServer();
}
