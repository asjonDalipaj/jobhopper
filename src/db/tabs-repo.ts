import { getDb } from './connection.js';
import type { Tab } from './types.js';

export function createTab(name: string, description?: string | null): Tab {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM tabs WHERE name = ?').get(name) as unknown as Tab | undefined;
  if (existing) {
    if (description) {
      db.prepare('UPDATE tabs SET description = ? WHERE id = ?').run(description, existing.id);
      return { ...existing, description };
    }
    return existing;
  }
  const info = db.prepare('INSERT INTO tabs (name, description) VALUES (?, ?)').run(name, description ?? null);
  const id = Number(info.lastInsertRowid);
  return db.prepare('SELECT * FROM tabs WHERE id = ?').get(id) as unknown as Tab;
}

export function listTabs(): Array<Tab & { item_count: number }> {
  return getDb()
    .prepare(
      `SELECT tabs.*, (SELECT COUNT(*) FROM tab_items WHERE tab_items.tab_id = tabs.id) AS item_count
       FROM tabs
       ORDER BY tabs.name`,
    )
    .all() as unknown as Array<Tab & { item_count: number }>;
}

export function getTab(name: string): Tab | undefined {
  return getDb().prepare('SELECT * FROM tabs WHERE name = ?').get(name) as unknown as Tab | undefined;
}

export function addToTab(tabName: string, jobId: number): { added: boolean } {
  const db = getDb();
  const tab = db.prepare('SELECT id FROM tabs WHERE name = ?').get(tabName) as unknown as { id: number } | undefined;
  if (!tab) throw new Error(`tab '${tabName}' does not exist`);
  const result = db
    .prepare('INSERT OR IGNORE INTO tab_items (tab_id, job_id) VALUES (?, ?)')
    .run(tab.id, jobId);
  return { added: Number(result.changes) > 0 };
}

export function getTabJobs(tabName: string): Array<import('./types.js').Job> {
  const tab = getDb().prepare('SELECT id FROM tabs WHERE name = ?').get(tabName) as unknown as { id: number } | undefined;
  if (!tab) throw new Error(`tab '${tabName}' does not exist`);
  return getDb()
    .prepare(
      `SELECT jobs.*
       FROM tab_items
       JOIN jobs ON jobs.id = tab_items.job_id
       WHERE tab_items.tab_id = ?
       ORDER BY jobs.posted_at IS NULL, jobs.posted_at DESC`,
    )
    .all(tab.id) as unknown as Array<import('./types.js').Job>;
}

export function deleteTab(name: string): boolean {
  const db = getDb();
  const tab = db.prepare('SELECT id FROM tabs WHERE name = ?').get(name) as unknown as { id: number } | undefined;
  if (!tab) return false;
  db.prepare('DELETE FROM tabs WHERE id = ?').run(tab.id);
  return true;
}