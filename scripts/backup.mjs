#!/usr/bin/env node
// Backup & Restore SQLite untuk Salad Yook
// Usage:
//   node scripts/backup.mjs            -> buat backup manual
//   node scripts/backup.mjs list       -> daftar backup tersedia
//   node scripts/backup.mjs restore <file> -> restore (server HARUS dimatikan)
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.sqlite');
const BACKUP_DIR = path.join(ROOT, 'backups');
const MAX_BACKUPS = 14;

const action = process.argv[2] || 'backup';
const argFile = process.argv[3];

function list() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('Belum ada backup.');
    return;
  }
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sqlite')).sort().reverse();
  if (files.length === 0) {
    console.log('Belum ada backup.');
    return;
  }
  console.log('Backup tersedia:');
  files.forEach((f, i) => {
    const stat = fs.statSync(path.join(BACKUP_DIR, f));
    console.log(`  ${i + 1}. ${f} (${(stat.size / 1024).toFixed(0)} KB, ${stat.mtime.toLocaleString('id-ID')})`);
  });
}

function backup() {
  if (!fs.existsSync(DB_FILE)) {
    console.error('Database tidak ditemukan:', DB_FILE);
    process.exit(1);
  }
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = path.join(BACKUP_DIR, `database-${stamp}.sqlite`);
  const db = new Database(DB_FILE);
  db.exec(`VACUUM INTO '${out}'`);
  db.close();
  console.log(`Backup dibuat: ${out}`);

  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('database-') && f.endsWith('.sqlite')).sort();
  while (files.length > MAX_BACKUPS) {
    const oldest = files.shift();
    fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    console.log(`Hapus backup lama: ${oldest}`);
  }
}

function restore(file) {
  const source = file
    ? path.resolve(ROOT, file)
    : (() => {
        if (!fs.existsSync(BACKUP_DIR)) { console.error('Tidak ada backup.'); process.exit(1); }
        const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sqlite')).sort().reverse();
        if (files.length === 0) { console.error('Tidak ada backup.'); process.exit(1); }
        return path.join(BACKUP_DIR, files[0]);
      })();

  if (!fs.existsSync(source)) {
    console.error('File backup tidak ditemukan:', source);
    process.exit(1);
  }

  // Backup DB lama sebelum restore (safety)
  if (fs.existsSync(DB_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const emergency = path.join(BACKUP_DIR, `pre-restore-${stamp}.sqlite`);
    fs.copyFileSync(DB_FILE, emergency);
    console.log(`Safety backup DB lama: ${emergency}`);
  }

  fs.copyFileSync(source, DB_FILE);
  // Hapus file WAL agar tidak menimpa data restore
  for (const suffix of ['-wal', '-shm']) {
    const f = DB_FILE + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log(`Restore berhasil dari: ${source}`);
  console.log('Jalankan ulang server.');
}

switch (action) {
  case 'list': list(); break;
  case 'restore': restore(argFile); break;
  case 'backup':
  default: backup(); break;
}
