import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import pc from 'picocolors';
import { listJobs } from '../db/jobs-repo.js';
import { htmlToPlainText } from '../sources/html.js';
import { getPaths } from '../storage/paths.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Load a committed JSON jobs snapshot (produced by `jobhopper run --json`). */
function loadJsonSnapshot(): Array<Record<string, unknown>> {
  const path = join(getPaths().exportsDir, 'jobs.json');
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(parsed)
      ? (parsed as Array<Record<string, unknown>>)
      : [];
  } catch {
    return [];
  }
}

/**
 * Start a minimal local web server serving the React frontend and local SQLite jobs API.
 */
export function startWebServer(port = 3333): void {
  const webDist = resolve(process.cwd(), 'web', 'dist');

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for Vite dev server proxy
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const host = req.headers.host || 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);

    // API endpoint returning local indexed jobs from SQLite with their verdicts
    if (url.pathname === '/api/jobs') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        // The committed JSON snapshot (.jobhopper/exports/jobs.json) is the
        // single reviewed source of truth: CI judges postings and commits it,
        // so a fresh `git pull` shows the latest jobs WITH their verdicts.
        // Prefer it; fall back to the local live DB only when there is no
        // snapshot (e.g. on a machine that has never run CI).
        const snapshot = loadJsonSnapshot();
        const source = snapshot.length > 0 ? snapshot : listJobs({ limit: 1000 });
        // Coerce stored HTML descriptions into clean, readable plain text so
        // the frontend never has to ingest raw markup or risk XSS.
        const cleaned = source.map((j) => {
          const desc = ((j as { description?: string }).description) || '';
          return { ...j, description: htmlToPlainText(desc) };
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(cleaned));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal database error';
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    // Serve built web frontend if dist exists
    if (existsSync(webDist)) {
      const sanitizedPath = url.pathname === '/' ? '/index.html' : url.pathname;
      const targetPath = resolve(webDist, '.' + sanitizedPath);

      // Prevent directory traversal attacks
      if (!targetPath.startsWith(webDist)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let filePath = targetPath;
      if (!existsSync(filePath)) {
        // Only fallback to index.html for SPA route navigation (not static file requests with extensions)
        if (!extname(sanitizedPath)) {
          filePath = join(webDist, 'index.html');
        } else {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
      }

      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      try {
        const fileContent = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fileContent);
        return;
      } catch {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body><h2>JobHopper Web UI</h2><p>Run <code>npm run build:web</code> or start Vite with <code>npm run web:dev</code></p></body></html>`);
  });

  server.listen(port, () => {
    console.log(pc.bold(pc.green('JobHopper Web UI started:')));
    console.log(`  Local server: ${pc.cyan(`http://localhost:${port}`)}`);
    console.log(`  API endpoint: ${pc.cyan(`http://localhost:${port}/api/jobs`)}`);
    console.log(`\nPress Ctrl+C to stop.`);
  });
}

