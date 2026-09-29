import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENUS } from '../server/menu-data';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

const row = db.prepare('SELECT data FROM app_state WHERE id = 1').get() as { data: string } | undefined;
if (!row) {
  console.error('app_state tidak ditemukan di database.sqlite');
  process.exit(1);
}

const state = JSON.parse(row.data);
state.menu = MENUS;
db.prepare('INSERT OR REPLACE INTO app_state (id, data) VALUES (1, ?)').run(JSON.stringify(state));

console.log(`app_state.menu diperbarui: ${state.menu.length} item`);