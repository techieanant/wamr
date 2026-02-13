import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'wamr.db');

const db = new Database(dbPath);

try {
  console.log('Resetting setup status...');
  db.exec('DELETE FROM setup_status');
  db.exec('DELETE FROM backup_codes');
  console.log('Setup status reset successfully');
} finally {
  db.close();
}
