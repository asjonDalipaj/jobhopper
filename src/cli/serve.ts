import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import pc from 'picocolors';
import { getJobByExternal, listJobs, setJobApplied } from '../db/jobs-repo.js';
import { activeRun, artifactDir, finishedPreps, getPrepRun, hasDisplay, jobFromPayload, latestPrep, startPrep, type PrepStepId } from '../apply/prep.js';
import { htmlToPlainText } from '../sources/html.js';

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
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Files the artifacts endpoint may serve, by exact name. No paths. */
const ARTIFACT_FILES = new Set(['cv.pdf', 'letter.pdf', 'letter.txt', 'form.png', 'plan.json']);

/** The only non-loopback page allowed to drive this server. */
const HOSTED_ORIGIN = 'https://jobhopper.pages.dev';

/**
 * Loopback pages (local UI, Vite dev) and the hosted build; nothing else.
 * A request with no Origin (curl, same-origin GET) is local by definition.
 */
function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === HOSTED_ORIGIN) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** A prep payload is a snapshot row; anything larger is not one. */
const MAX_BODY_BYTES = 1_000_000;

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

/**
 * Start a minimal local web server serving the React frontend and local SQLite jobs API.
 */
export function startWebServer(port = 3333): void {
  const webDist = resolve(process.cwd(), 'web', 'dist');

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);
    const origin = req.headers.origin;

    // Refuse a foreign origin before reading the body. With an accepted job
    // payload, a remote page could otherwise point the filler — and your CV —
    // at a form of its choosing. Preview deployments are deliberately excluded.
    if (!originAllowed(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'origin not allowed' }));
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Chrome's Private Network Access: a page on a public origin (e.g. the
    // hosted Cloudflare build) may only call localhost if it opts in here.
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Record an "applied" flag from the web UI (works on the local server;
    // the static hosted site stores it in localStorage instead).
    if (url.pathname === '/api/applied' && req.method === 'POST') {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
      };
      void (async () => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { source, externalId, appliedAt } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            source?: string;
            externalId?: string;
            appliedAt?: string | null;
          };
          if (!source || !externalId) {
            send(400, { error: 'source and externalId are required' });
            return;
          }
          const ok = setJobApplied(source, externalId, appliedAt ?? null);
          send(ok ? 200 : 404, ok ? { ok: true } : { error: 'unknown job' });
        } catch (err) {
          send(400, { error: err instanceof Error ? err.message : 'invalid JSON body' });
        }
      })();
      return;
    }

    // Fallback snapshot for the web UI's static mode: if the dist copy of
    // jobs.json is missing or stale (it is only refreshed by an explicit
    // `cp` or the deploy workflow), serve the live exports snapshot instead.
    if (url.pathname === '/jobs.json') {
      const exportsSnapshot = resolve(process.cwd(), '.jobhopper', 'exports', 'jobs.json');
      const distCopy = join(webDist, 'jobs.json');
      const target = existsSync(exportsSnapshot)
        && (!existsSync(distCopy) || statSync(exportsSnapshot).mtimeMs > statSync(distCopy).mtimeMs)
        ? exportsSnapshot
        : distCopy;
      if (existsSync(target)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(readFileSync(target));
        return;
      }
    }

    // API endpoint returning local indexed jobs from SQLite with their verdicts
    if (url.pathname === '/api/jobs') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      try {
        // Local UI must show current local scans, not a stale committed snapshot.
        const source = listJobs({ limit: 1000 });
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

    // Local bridge handshake. The hosted build probes this same-origin first,
    // then http://localhost:3333; only a JSON answer counts as "local running".
    if (url.pathname === '/api/status') {
      sendJson(res, 200, { ok: true, app: 'jobhopper', prep: true, display: hasDisplay() });
      return;
    }

    // Start a prep run (tailor + letter + fill). Returns immediately; the UI
    // polls /api/prep/:id. mode 'review' opens a visible window and lets the
    // human submit; mode 'fill' (default) is headless and never submits.
    if (url.pathname === '/api/prep' && req.method === 'POST') {
      void (async () => {
        try {
          const body = await readJsonBody<{
            source?: string;
            externalId?: string;
            steps?: PrepStepId[];
            force?: boolean;
            mode?: 'fill' | 'review';
            /** The snapshot row the hosted page rendered; used only when the DB has no row. */
            job?: unknown;
          }>(req);
          const { source, externalId } = body;
          if (!source || !externalId) {
            sendJson(res, 400, { error: 'source and externalId are required' });
            return;
          }
          // The local row wins (stable id, applied flag, freshest description).
          // The snapshot copy lets a role this machine never scanned — or one
          // purge removed — still be prepared from the hosted page.
          const job = getJobByExternal(source, externalId) ?? jobFromPayload(body.job, source, externalId);
          if (!job) {
            sendJson(res, 404, { error: 'unknown job' });
            return;
          }
          const running = activeRun(source, externalId);
          if (running) {
            sendJson(res, 409, { error: 'a prep run is already in progress', runId: running.id, run: running });
            return;
          }
          const mode = body.mode === 'review' ? 'review' : 'fill';
          if (mode === 'review' && !hasDisplay()) {
            sendJson(res, 409, {
              code: 'no-display',
              error: 'No desktop display for the review window. Start `jobhopper ui` from your terminal.',
              // 0 marks a snapshot-only role: there is no local id to print.
              jobId: job.id > 0 ? job.id : null,
            });
            return;
          }
          const steps = Array.isArray(body.steps)
            ? body.steps.filter((s): s is PrepStepId => s === 'cv' || s === 'letter' || s === 'fill')
            : undefined;
          const run = startPrep(job, { steps, force: body.force, mode });
          sendJson(res, 202, { runId: run.id, run });
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : 'invalid request' });
        }
      })();
      return;
    }

    if (url.pathname === '/api/prep/latest' && req.method === 'GET') {
      const source = url.searchParams.get('source');
      const externalId = url.searchParams.get('externalId');
      if (source && externalId) {
        sendJson(res, 200, { run: latestPrep(source, externalId) ?? null });
      } else {
        sendJson(res, 200, { runs: finishedPreps() });
      }
      return;
    }

    if (url.pathname.startsWith('/api/prep/') && req.method === 'GET') {
      const id = url.pathname.slice('/api/prep/'.length);
      const run = getPrepRun(id);
      if (!run) {
        sendJson(res, 404, { error: 'unknown run' });
        return;
      }
      sendJson(res, 200, { run });
      return;
    }

    // Generated artifacts for one job. Exact filenames only, resolved inside
    // that job's own applications directory.
    if (url.pathname === '/api/artifacts' && req.method === 'GET') {
      const source = url.searchParams.get('source') ?? '';
      const externalId = url.searchParams.get('externalId') ?? '';
      const file = url.searchParams.get('file') ?? '';
      if (!source || !externalId || !ARTIFACT_FILES.has(file)) {
        sendJson(res, 400, { error: 'source, externalId and a known file are required' });
        return;
      }
      const job = getJobByExternal(source, externalId);
      // A snapshot-only role has no DB row; its artifact directory comes from
      // the same three identity fields the client rendered, so accept them.
      const company = job?.company ?? (url.searchParams.get('company') ?? '').trim();
      const title = job?.title ?? (url.searchParams.get('title') ?? '').trim();
      if (!company || !title) {
        sendJson(res, 404, { error: 'unknown job' });
        return;
      }
      const dir = resolve(artifactDir({ source, external_id: externalId, company, title }));
      const target = resolve(dir, file);
      if (!target.startsWith(`${dir}/`) || !existsSync(target)) {
        sendJson(res, 404, { error: 'artifact not found' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(readFileSync(target));
      return;
    }

    // Serve built web frontend if dist exists
    if (existsSync(webDist)) {      const sanitizedPath = url.pathname === '/' ? '/index.html' : url.pathname;
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

