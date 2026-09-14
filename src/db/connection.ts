import { DatabaseSync } from 'node:sqlite';
import { getPaths, ensureDirs } from '../storage/paths.js';

let _db: DatabaseSync | null = null;

/** Open (and lazily cache) the jobhopper SQLite database. */
export function getDb(): DatabaseSync {
  if (_db !== null) return _db;
  ensureDirs();
  _db = new DatabaseSync(getPaths().db);
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');
  migrate(_db);
  return _db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  workplace_type TEXT,
  employment_type TEXT,
  url TEXT,
  description TEXT NOT NULL DEFAULT '',
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  tags TEXT,
  UNIQUE(source, external_id)
);

-- Standalone FTS5 index (keeps its own content). Maintained from the
-- repository layer on every insert/update/delete.
CREATE VIRTUAL TABLE IF NOT EXISTS jobs_fts USING fts5(
  title, company, location, description,
  tokenize='porter'
);

CREATE TABLE IF NOT EXISTS judgments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  reasoning TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL,
  quick INTEGER NOT NULL DEFAULT 0,
  judged_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id)
);

CREATE TABLE IF NOT EXISTS tabs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tab_items (
  tab_id INTEGER NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tab_id, job_id)
);
`;

function migrate(db: DatabaseSync): void {
  db.exec(SCHEMA);
}

/** Close the database connection (used in tests / process teardown). */
export function closeDb(): void {
  if (_db !== null) {
    _db.close();
    _db = null;
  }
}