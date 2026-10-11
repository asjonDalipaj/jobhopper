#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { closeDb } from '../db/connection.js';
import { loadConfig, saveConfig, resolveApiKey, hasApiKey } from '../config/config.js';
import { listJobs, searchJobs, countJobs, getJob, listJudgedJobs, purgeStaleAndOffMarket } from '../db/jobs-repo.js';
import { storeJudgment, listJudgments } from '../db/judgments-repo.js';
import { createTab, listTabs, addToTab, getTabJobs, deleteTab, getTab } from '../db/tabs-repo.js';
import { scanCompanies } from '../sources/scan.js';
import { DEFAULT_COMPANIES } from '../sources/companies.js';
import { readFileSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getPaths, ensureDirs } from '../storage/paths.js';
import { importCvPdf, readCvText, readProfileDoc, writeProfileDoc, profileFiles } from '../profile/cv.js';
import { judgePosting } from '../judge/openrouter.js';
import { boxTable, verdictColor, dim } from './ui.js';
import { loadJobsConfig, saveJobsConfig, toJobSpec, jobsConfigPath, type JobSpec } from '../jobs/config.js';
import { runJob, runAllJobs } from '../jobs/run.js';
import { exportToHtmlFile, exportJobsToJsonFile, mergeSnapshotRows, type HtmlRow } from '../export/html.js';
import { startWebServer } from './serve.js';


const program = new Command();

program
  .name('jobhopper')
  .description('Local-first job search & evaluation CLI for EU software engineers')
  .version('0.1.0');

function requireKey(): void {
  const config = loadConfig();
  if (!hasApiKey(config)) {
    console.error(
      pc.red('No OpenRouter API key set.') +
        '\nRun ' +
        pc.cyan('jobhopper config set-openrouter-key') +
        ', or export OPENROUTER_API_KEY.',
    );
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ *
 * config
 * ------------------------------------------------------------------ */
const config = program.command('config').description('Manage OpenRouter key and model settings');

config
  .command('set-openrouter-key')
  .description('Set the OpenRouter API key (stored locally in config.json)')
  .argument('[key]', 'the API key; if omitted, read from OPENROUTER_API_KEY')
  .action((keyArg?: string) => {
    const cwd = loadConfig();
    const key = keyArg?.trim() || process.env['OPENROUTER_API_KEY']?.trim() || '';
    if (!key) {
      console.error(pc.red('No key provided. Pass it as an argument or set OPENROUTER_API_KEY.'));
      process.exit(1);
    }
    cwd.openrouterKey = key;
    saveConfig(cwd);
    console.log(pc.green('OpenRouter API key saved locally.'));
  });

config
  .command('set-model')
  .description('Set the model used for full judgments')
  .argument('<model>', 'OpenRouter model id, e.g. openai/gpt-4o-mini')
  .action((model: string) => {
    const cwd = loadConfig();
    cwd.model = model;
    saveConfig(cwd);
    console.log(pc.green(`Full-judgment model set to ${model}.`));
  });

config
  .command('set-quick-model')
  .description('Set the model used for quick judgments')
  .argument('<model>', 'OpenRouter model id')
  .action((model: string) => {
    const cwd = loadConfig();
    cwd.quickModel = model;
    saveConfig(cwd);
    console.log(pc.green(`Quick model set to ${model}.`));
  });

config
  .command('show')
  .description('Show current configuration (key masked)')
  .action(() => {
    const c = loadConfig();
    const key = resolveApiKey(c);
    const masked = key ? `${key.slice(0, 6)}…${key.slice(-4)}` : '(not set)';
    console.log(`OpenRouter key : ${masked}`);
    console.log(`Full model     : ${c.model}`);
    console.log(`Quick model    : ${c.quickModel}`);
    console.log(`Config file    : ${getPaths().configFile}`);
  });
/* ------------------------------------------------------------------ *
 * profile
 * ------------------------------------------------------------------ */
const profile = program.command('profile').description('Manage your local, private profile');

profile
  .command('import-cv')
  .description('Extract text from a PDF CV and store it locally')
  .argument('<path>', 'path to the PDF file')
  .action(async (pdfPath: string) => {
    try {
      const r = await importCvPdf(pdfPath);
      console.log(pc.green(`CV imported: ${r.pages} page(s), ${r.charCount} chars -> ${r.file}`));
    } catch (err) {
      console.error(pc.red('Could not import CV: ') + (err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

profile
  .command('set')
  .description('Set a profile document from a file or piped stdin')
  .argument('<name>', 'document name: preferences, constraints, background (or custom)')
  .argument('[file]', 'optional file path; defaults to stdin')
  .action((name: string, file?: string) => {
    let text = '';
    if (file) {
      if (!existsSync(file)) {
        console.error(pc.red(`File not found: ${file}`));
        process.exit(1);
      }
      text = readFileSync(file, 'utf8');
    } else {
      if (process.stdin.isTTY) {
        console.error(
          pc.yellow('Running in an interactive terminal. Please supply a file path: ') +
            pc.cyan(`jobhopper profile set ${name} <path/to/file.md>`) +
            pc.dim(' or pipe into standard input.'),
        );
        process.exit(1);
      }
      text = readFileSync(process.stdin.fd, 'utf8');
    }
    writeProfileDoc(name, text);
    console.log(pc.green(`Saved profile document '${name}' (${text.length} chars).`));
  });

profile
  .command('show')
  .description('Show your stored profile')
  .action(() => {
    const cv = readCvText();
    console.log(pc.bold('Stored profile:'));
    for (const f of profileFiles()) {
      const size = existsSync(join(getPaths().profileDir, f)) ? statSync(join(getPaths().profileDir, f)).size : 0;
      console.log(dim(`  ${f} (${size} bytes)`));
    }
    console.log(`\n${pc.bold('CV')} (${cv.length} chars):`);
    console.log(dim(cv.slice(0, 600)) + (cv.length > 600 ? pc.dim('\n…') : ''));
  });

profile
  .command('get')
  .description('Print the text of a profile document')
  .argument('<name>', 'document name')
  .action((name: string) => {
    const text = readProfileDoc(name);
    if (!text && name !== 'cv') console.error(pc.yellow(`No profile document '${name}' found.`));
    process.stdout.write(text + (text ? '\n' : ''));
  });

/* ------------------------------------------------------------------ *
 * companies
 * ------------------------------------------------------------------ */
const companies = program.command('companies').description('Manage the company scan registry');

companies
  .command('list')
  .description('List configured companies')
  .action(() => {
    const table: unknown[][] = DEFAULT_COMPANIES.map((c, i) => [i + 1, c.name, c.ats, c.token]);
    process.stdout.write(boxTable(['#', 'Company', 'ATS', 'Token'], table) + '\n');
  });

companies
  .command('verify')
  .description('Live-check which configured board tokens actually respond')
  .action(async () => {
    const { filterLiveCompanies } = await import('../sources/verify.js');
    console.log(pc.cyan('Checking board tokens…'));
    const { live, dead } = await filterLiveCompanies(DEFAULT_COMPANIES);
    console.log(`\n${pc.green('Live')}: ${live.length} · ${pc.red('Dead')}: ${dead.length}`);
    if (live.length) {
      const t: unknown[][] = live.map((c, i) => [i + 1, c.name, c.ats, c.token]);
      process.stdout.write(boxTable(['#', 'Company', 'ATS', 'Token'], t) + '\n');
    }
    if (dead.length) {
      console.log(dim('\nThese tokens did not respond — consider fixing or removing:'));
      for (const c of dead) console.log(dim(`  ${c.name} (${c.ats}/${c.token})`));
    }
  });

/* ------------------------------------------------------------------ *
 * scan
 * ------------------------------------------------------------------ */
program
  .command('scan')
  .description('Fetch job postings from configured company boards (and optionally open aggregators)')
  .option('-c, --company <name>', 'scan only one company by name')
  .option('-a, --aggregators', 'also pull whole-market remote aggregators (Remotive, RemoteOK)')
  .option('--verify', 'check board tokens first and skip dead ones')
  .option('--no-judge', 'skip the auto quick-judge/auto-reject pass on new postings')
  .action(async (opts: { company?: string; aggregators?: boolean; verify?: boolean; judge?: boolean }) => {
    ensureDirs();
    let list = DEFAULT_COMPANIES;
    if (opts.company) {
      const hit = DEFAULT_COMPANIES.find((c) => c.name.toLowerCase() === opts.company!.toLowerCase());
      if (!hit) {
        console.error(pc.red(`Unknown company '${opts.company}'. `) + 'Run `jobhopper companies list`.');
        process.exit(1);
      }
      list = [hit];
    }
    console.log(pc.cyan(`Scanning ${list.length} company board(s)${opts.aggregators ? ' + open aggregators' : ''}…`));
    const result = await scanCompanies(list, {
      verifyBoards: opts.verify,
      includeAggregators: opts.aggregators,
      judge: opts.judge,
    });
    console.log(
      pc.green(`\nDone: ${result.fetched} postings fetched, ${result.inserted} new, total in DB: ${countJobs()}.`),
    );
    console.log(
      dim(
      `  filtered out ${result.skippedOffMarket} off-market, ${result.skippedStale} stale, ${result.skippedOffRole} unrelated roles at ingestion.`,
      ),
    );
    if (result.judged || result.rejected) {
      console.log(dim(`  quick-judged ${result.judged}, auto-rejected (verdict "no") ${result.rejected}.`));
    }
    if (result.deadBoards.length) console.log(dim(`  skipped ${result.deadBoards.length} dead board(s): ${result.deadBoards.join(', ')}`));
    if (result.errors.length) {
      console.log(dim(`\n${result.errors.length} source(s) failed:`));
      for (const e of result.errors) console.log(dim(`  ${e.company}: ${e.message}`));
    }
  });

/* ------------------------------------------------------------------ *
 * cleanup
 * ------------------------------------------------------------------ */
program
  .command('cleanup')
  .description('Purge noise: off-market postings and stale ones that were never judged or applied. Judged/applied history is always kept.')
  .action(() => {
    const before = countJobs();
    const { removedStale, removedOffMarket } = purgeStaleAndOffMarket();
    console.log(
      pc.green(
        `Removed ${removedOffMarket} off-market and ${removedStale} stale posting(s). ${before} -> ${countJobs()} jobs.`,
      ),
    );
  });
/* ------------------------------------------------------------------ *
 * search
 * ------------------------------------------------------------------ */
program
  .command('search')
  .description('Full-text search the local job database')
  .argument('[query...]', 'keywords to search')
  .option('-c, --country <country>', 'filter by country substring (e.g. "Netherlands")')
  .option('-r, --remote', 'only remote postings')
  .option('-k, --contract', 'only contract postings')
  .option('-u, --unjudged', 'only postings not yet judged')
  .option('-l, --limit <n>', 'max results', '30')
  .option('--source <source>', 'only postings from this source (e.g. aggregator-remoteok)')
  .option('--json', 'output JSON')
  .action((query: string[], opts: Record<string, unknown>) => {
    const q = query.join(' ');
    if (!q) {
      console.error(pc.yellow('Provide a search query, e.g. jobhopper search java fullstack'));
      process.exit(1);
    }
    const rows = searchJobs({
      query: q,
      country: opts.country as string | undefined,
      remote: opts.remote as boolean,
      contract: opts.contract as boolean,
      source: opts.source as string | undefined,
      unjudged: opts.unjudged as boolean,
      limit: Number(opts.limit),
    });
    if ((opts.json as boolean) === true) {
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
      return;
    }
    if (!rows.length) {
      console.log(dim('No matches.'));
      return;
    }
    const table: unknown[][] = rows.map((r) => [
      r.id,
      r.company,
      r.title,
      r.location,
      r.source,
      r.verdict ? verdictColor(r.verdict) : dim('—'),
      r.posted_at ? r.posted_at.slice(0, 10) : dim('?'),
    ]);
    process.stdout.write(boxTable(['ID', 'Company', 'Title', 'Location', 'Source', 'Verdict', 'Posted'], table) + '\n');
  });

/* ------------------------------------------------------------------ *
 * list
 * ------------------------------------------------------------------ */
program
  .command('list')
  .description('List jobs from the local database')
  .option('-c, --country <country>', 'filter by country substring')
  .option('-r, --remote', 'only remote postings')
  .option('-k, --contract', 'only contract postings')
  .option('-u, --unjudged', 'only postings not yet judged')
  .option('-l, --limit <n>', 'max results', '30')
  .option('--source <source>', 'only postings from this source (e.g. aggregator-remoteok)')
  .option('--json', 'output JSON')
  .action((opts: Record<string, unknown>) => {
    const rows = listJobs({
      country: opts.country as string | undefined,
      remote: opts.remote as boolean,
      contract: opts.contract as boolean,
      source: opts.source as string | undefined,
      unjudged: opts.unjudged as boolean,
      limit: Number(opts.limit),
    });
    if ((opts.json as boolean) === true) {
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
      return;
    }
    if (!rows.length) {
      console.log(dim('No jobs stored. Run `jobhopper scan` first.'));
      return;
    }
    const table: unknown[][] = rows.map((r) => [
      r.id,
      r.company,
      r.title,
      r.location,
      r.source,
      r.verdict ? verdictColor(r.verdict) : dim('—'),
      r.posted_at ? r.posted_at.slice(0, 10) : dim('?'),
    ]);
    process.stdout.write(boxTable(['ID', 'Company', 'Title', 'Location', 'Source', 'Verdict', 'Posted'], table) + '\n');
  });

/* ------------------------------------------------------------------ *
 * judge
 * ------------------------------------------------------------------ */
program
  .command('judge')
  .description('Judge poster(s) against your profile via OpenRouter')
  .argument('[id]', 'job id to judge')
  .option('-t, --tab <name>', 'judge all jobs in a tab')
  .option('--all', 'judge all unjudged jobs in the DB')
  .option('--quick', 'use the cheaper quick model')
  .option('--model <model>', 'override the model')
  .option('--limit <n>', 'max to judge when --all', '20')
  .action(async (id: string | undefined, opts: Record<string, unknown>) => {
    requireKey();
    const targets: number[] = [];
    if (id) {
      const job = getJob(Number(id));
      if (!job) {
        console.error(pc.red(`No job with id ${id}.`));
        process.exit(1);
      }
      targets.push(job.id);
    } else if (opts.tab) {
      targets.push(...getTabJobs(opts.tab as string).map((j) => j.id));
    } else if (opts.all) {
      targets.push(...listJobs({ unjudged: true, limit: Number(opts.limit) }).map((j) => j.id));
    } else {
      console.error(pc.red('Provide a job <id>, --tab <name>, or --all.'));
      process.exit(1);
    }
    if (!targets.length) {
      console.log(dim('Nothing to judge.'));
      return;
    }
    const quick = opts.quick as boolean;
    console.log(pc.cyan(`Judging ${targets.length} posting(s)…`));
    for (const jid of targets) {
      const job = getJob(jid)!;
      try {
        const result = await judgePosting(job, { model: opts.model as string | undefined, quick });
        storeJudgment({ jobId: jid, verdict: result.verdict, reasoning: result.reasoning, model: result.model, quick });
        console.log(`${verdictColor(result.verdict.toUpperCase())}  ${job.company} — ${job.title}  ${dim(`[${result.model}]`)}`);
        if (result.matches.length) console.log(dim(`   ✓ ${result.matches.join(' · ')}`));
        if (result.gaps.length) console.log(dim(`   ✗ ${result.gaps.join(' · ')}`));
      } catch (err) {
        console.error(pc.red(`  failed ${job.title}: `) + (err instanceof Error ? err.message : String(err)));
      }
    }
  });

/* ------------------------------------------------------------------ *
 * judgments
 * ------------------------------------------------------------------ */
program
  .command('judgments')
  .description('List stored judgments')
  .option('-v, --verdict <verdict>', 'filter by verdict (strong/fair/weak/no)')
  .option('-l, --limit <n>', 'max results', '30')
  .action((opts: Record<string, unknown>) => {
    const rows = listJudgments({
      limit: Number(opts.limit),
      verdict: (opts.verdict as 'strong' | 'fair' | 'weak' | 'no' | undefined) ?? null,
    });
    if (!rows.length) {
      console.log(dim('No judgments stored yet.'));
      return;
    }
    const table: unknown[][] = rows.map((r) => [
      r.job_id,
      r.company,
      r.title,
      verdictColor(r.verdict),
      r.model,
      r.judged_at.slice(0, 10),
    ]);
    process.stdout.write(boxTable(['Job', 'Company', 'Title', 'Verdict', 'Model', 'Judged'], table) + '\n');
  });
/* ------------------------------------------------------------------ *
 * tab
 * ------------------------------------------------------------------ */
const tab = program.command('tab').description('Manage shortlists (saved lists of jobs)');

tab
  .command('create')
  .description('Create a tab')
  .argument('<name>', 'tab name')
  .option('-d, --description <text>', 'optional description')
  .action((name: string, opts: { description?: string }) => {
    createTab(name, opts.description);
    console.log(pc.green(`Created tab '${name}'.`));
  });

tab
  .command('list')
  .description('List tabs')
  .action(() => {
    const tabs = listTabs();
    if (!tabs.length) {
      console.log(dim('No tabs. Create one with `jobhopper tab create`.'));
      return;
    }
    const table: unknown[][] = tabs.map((t) => [t.name, t.item_count, t.description ?? '']);
    process.stdout.write(boxTable(['Tab', 'Jobs', 'Description'], table) + '\n');
  });

tab
  .command('add')
  .description('Add a job to a tab')
  .argument('<tab>', 'tab name')
  .argument('<id>', 'job id')
  .action((name: string, id: string) => {
    const r = addToTab(name, Number(id));
    console.log(r.added ? pc.green(`Added job ${id} to '${name}'.`) : dim(`Job ${id} already in '${name}'.`));
  });

tab
  .command('get')
  .description('Show jobs in a tab')
  .argument('<name>', 'tab name')
  .option('--json', 'output JSON')
  .action((name: string, opts: { json?: boolean }) => {
    if (!getTab(name)) {
      console.error(pc.red(`Tab '${name}' does not exist.`));
      process.exit(1);
    }
    const jobs = getTabJobs(name);
    if ((opts.json as boolean) === true) {
      process.stdout.write(JSON.stringify(jobs, null, 2) + '\n');
      return;
    }
    if (!jobs.length) {
      console.log(dim(`Tab '${name}' is empty.`));
      return;
    }
    const table: unknown[][] = jobs.map((j) => [j.id, j.company, j.title, j.location, j.url ?? '']);
    process.stdout.write(boxTable(['ID', 'Company', 'Title', 'Location', 'URL'], table) + '\n');
  });

tab
  .command('rm')
  .description('Delete a tab')
  .argument('<name>', 'tab name')
  .action((name: string) => {
    deleteTab(name) ? console.log(pc.green(`Deleted tab '${name}'.`)) : console.error(pc.red(`Tab '${name}' not found.`));
  });

/* ------------------------------------------------------------------ *
 * export
 * ------------------------------------------------------------------ */
program
  .command('export')
  .description('Generate a clickable HTML dashboard of a tab (or all jobs)')
  .argument('[tab]', 'tab name to export; omit to export all jobs')
  .option('-o, --output <path>', 'output html path', 'shortlist.html')
  .action((tabName: string | undefined, opts: { output: string }) => {
    const rows = tabName ? getTabJobs(tabName) : listJobs({ limit: 1000 });
    if (!rows.length) {
      console.log(dim('Nothing to export.'));
      return;
    }
    const htmlRows: HtmlRow[] = rows.map((r) => ({
      company: r.company,
      title: r.title,
      location: r.location,
      url: r.url,
      description: r.description,
      source: r.source,
      posted_at: r.posted_at,
    }));
    exportToHtmlFile(htmlRows, opts.output);
    console.log(pc.green(`Wrote ${rows.length} posting(s) to ${opts.output}`));
  });

/* ------------------------------------------------------------------ *
 * jobs & run
 * ------------------------------------------------------------------ */
program
  .command('jobs')
  .description('Show configured named jobs, or write a starter jobs.json')
  .option('--init', 'write a starter jobs.json with examples (does not overwrite)')
  .action((opts: { init?: boolean }) => {
    const path = jobsConfigPath();
    const existing = loadJobsConfig();
    if (opts.init) {
      if (existing.jobs.length) {
        console.log(dim(`jobs.json already has ${existing.jobs.length} job(s): ${path}`));
        return;
      }
      const samples: JobSpec[] = [
        { name: 'netherlands-fullstack', query: 'fullstack java', country: 'Netherlands', limit: 20 },
        { name: 'eu-remote-software', query: 'software engineer', remote: true, limit: 30 },
        { name: 'eu-remote-contracts', remote: true, contract: true, limit: 20 },
      ];
      saveJobsConfig({ jobs: samples });
      console.log(pc.green(`Wrote starter jobs.json to ${path}`));
      console.log('Edit it to add your own filters, then run `jobhopper run`.');
      return;
    }
    if (!existing.jobs.length) {
      console.log(dim('No jobs configured. Run `jobhopper jobs --init` to scaffold, then edit jobs.json.'));
      return;
    }
    const table: unknown[][] = existing.jobs.map((j, i) => [
      i + 1,
      j.name,
      j.query ?? '—',
      j.country ?? '—',
      j.output ?? `exports/${j.name}.html`,
    ]);
    process.stdout.write(boxTable(['#', 'Job', 'Query', 'Country', 'HTML output'], table) + '\n');
  });

program
  .command('run')
  .description('Run every named job in jobs.json: find -> refresh tab -> judge -> export HTML')
  .option('--job <name>', 'run only this named job')
  .option('--no-judge', 'skip judging even for jobs marked judge:true')
  .option('-j, --json <path>', 'also write a JSON jobs snapshot (default: exports/jobs.json)')
  .action(async (opts: { job?: string; noJudge?: boolean; json?: string }) => {
    const cfg = loadJobsConfig();
    if (!cfg.jobs.length) {
      console.log(dim('No jobs configured. Run `jobhopper jobs --init` to scaffold, then edit jobs.json.'));
      return;
    }
    let specs = cfg.jobs;
    if (opts.job) {
      specs = specs.filter((s) => s.name === opts.job);
      if (!specs.length) {
        console.error(pc.red(`No job named '${opts.job}'. Run \`jobhopper jobs\` to list them.`));
        process.exit(1);
      }
    }
    if (opts.noJudge) specs = specs.map((s) => ({ ...s, judge: false }));

    console.log(pc.cyan(`Running ${specs.length} job(s)…`));
    const results = await runAllJobs(specs);
    for (const r of results) {
      const suffix = r.error ? pc.red(` error: ${r.error}`) : ` (judged ${r.judged})`;
      console.log(`${r.found > 0 ? pc.green(`${r.found} found`) : dim('0 found')}  ${dim(r.name)}  ${r.output ? dim('->') + ` ${r.output}` : ''}${suffix}`);
    }

    // Write a JSON snapshot of the full local DB (with verdicts) so the React
    // web UI can show the same data via a committed file when no local DB exists.
    if (opts.json !== undefined) {
      const jsonPath = opts.json && opts.json !== 'true' ? opts.json : join(getPaths().exportsDir, 'jobs.json');
      // Newest postings first. A judged posting must never be dropped just
      // because it falls outside the newest-1000 cutoff, so merge the judged
      // rows in too — this keeps every verdict visible on the React board.
      const newest = listJobs({ limit: 1000 });
      const withJudgments = listJudgedJobs(5000);
      const byId = new Map<number, (typeof newest)[number]>();
      newest.forEach((j) => byId.set(j.id, j));
      withJudgments.forEach((j) => {
        if (!byId.has(j.id)) byId.set(j.id, j);
      });
      const rows = Array.from(byId.values()).map((j) => ({
        id: j.id,
        external_id: j.external_id,
        source: j.source,
        company: j.company,
        title: j.title,
        location: j.location,
        workplace_type: j.workplace_type,
        employment_type: j.employment_type,
        url: j.url,
        description: j.description,
        posted_at: j.posted_at,
        tags: j.tags ?? null,
        verdict: j.verdict ?? null,
        reasoning: j.reasoning ?? null,
        applied_at: j.applied_at ?? null,
        first_seen: null as string | null, // set below from the previous snapshot
      }));
      // Merge rather than overwrite: committed rows that the local DB no longer
      // holds (e.g. postings from an earlier CI run) must survive a re-export.
      let existing: typeof rows = [];
      if (existsSync(jsonPath)) {
        try {
          const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
          if (Array.isArray(parsed)) existing = parsed as typeof rows;
        } catch {
          existing = [];
        }
      }
      // First-seen tracking: the previous committed snapshot is the only
      // cross-run memory (the DB is rebuilt on every CI runner). Rows the
      // last snapshot already knew keep their original first_seen; everything
      // else is stamped with this run's time.
      const prevFirstSeen = new Map<string, string | null>(
        existing.map((r) => [`${r.source}:${r.external_id}`, r.first_seen ?? null]),
      );
      const nowISO = new Date().toISOString();
      for (const row of rows) {
        row.first_seen = prevFirstSeen.get(`${row.source}:${row.external_id}`) ?? nowISO;
      }
      exportJobsToJsonFile(mergeSnapshotRows(existing, rows), jsonPath);
      const newCount = rows.filter((r) => prevFirstSeen.get(`${r.source}:${r.external_id}`) === null || prevFirstSeen.get(`${r.source}:${r.external_id}`) === undefined).length;
      console.log(dim('->') + ` ${dim('wrote JSON snapshot')} ${pc.cyan(jsonPath)}` + (existing.length ? dim(` (${newCount} new since last snapshot)`) : ''));
    }
  });

/* ------------------------------------------------------------------ *
 * ui (web)
 * ------------------------------------------------------------------ */
program
  .command('ui')
  .description('Start the local minimalist React frontend and API server')
  .option('-p, --port <port>', 'Port to listen on', '3333')
  .action((opts: { port: string }) => {
    startWebServer(parseInt(opts.port, 10) || 3333);
  });

/* ------------------------------------------------------------------ *
 * status
 * ------------------------------------------------------------------ */
program
  .command('status')
  .description('Show local database status')
  .action(() => {
    const jobs = countJobs();
    const config = loadConfig();
    console.log(pc.bold('JobHopper'));
    console.log(`  Database   : ${dim(getPaths().db)}`);
    console.log(`  Jobs stored: ${jobs}`);
    console.log(`  API key    : ${hasApiKey(config) ? pc.green('set') : pc.red('NOT SET')}`);
    console.log(`  Full model : ${config.model}`);
    console.log(`  Quick model: ${config.quickModel}`);
    console.log(`  Profile    : ${dim(join(getPaths().profileDir))}`);
  });

/* ------------------------------------------------------------------ *
 * welcome / guide
 * ------------------------------------------------------------------ */
program
  .command('welcome')
  .description('Print a quick getting-started guide')
  .action(() => {
    console.log(`${pc.bold('Welcome to jobhopper — local-first EU job search.')}

Your data stays on this machine. Nothing is uploaded to a middleman.

Quick start:
  1. jobhopper config set-openrouter-key <your_key>
  2. jobhopper profile import-cv /path/to/cv.pdf
  3. jobhopper profile set preferences          (paste preferences; Ctrl-D to send)
  4. jobhopper scan                              (fetch jobs from Dutch/EU boards)
  5. jobhopper search fullstack --country Netherlands
  6. jobhopper judge 1 --quick                  (judge job id 1 against your profile)
  7. jobhopper export netherlands-roles         (clickable HTML dashboard)

See 'jobhopper guide' for the full command reference.`);
  });

program
  .command('guide')
  .description('Show the full command reference')
  .action(() => {
    console.log(`${pc.bold('jobhopper guide')}

Commands:
  config set-openrouter-key [key]    set OpenRouter API key (local)
  config set-model <id>              set full-judgment model
  config set-quick-model <id>        set quick-judgment model
  config show                        show config (key masked)
  profile import-cv <pdf>            extract CV text locally from a PDF
  profile set <name> [file]          set a profile doc (preferences/constraints/background)
  profile show / get <name>          view stored profile docs
  companies list                     list configured boards
  scan [-c <name>] [-a] [--no-judge] fetch postings from configured boards (IT/ES/NL only, <=30d)
  cleanup                            purge stored jobs outside IT/ES/NL or older than 30 days
  search <words> [filters]           full-text search local DB
  list [filters]                     list jobs
  judge <id> | --tab <t> | --all     judge postings against your profile (OpenRouter)
  judgments [--verdict <v>]          list stored verdicts
  tab create/list/add/get/rm         manage shortlists
  export [tab] [-o out.html]         build a clickable HTML dashboard
  status                             show DB / config status

Common filters: --country <name> --remote --contract --unjudged --limit <n>`);
  });

program.parseAsync().then(() => closeDb()).catch((err) => {
  console.error(pc.red(String(err?.message ?? err)));
  // A failed command must fail the process, otherwise CI steps report success
  // while doing nothing (e.g. judging a tab that no longer exists).
  process.exitCode = 1;
});