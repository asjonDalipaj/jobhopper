#!/usr/bin/env node
/**
 * Better universe for Italy: take Italian tech employers' own domains, find the
 * ATS their careers page actually links to, then probe that board for fresh,
 * relevant Italian roles. No job-board scraping: we read the employer's page
 * once to learn the board, then talk to the board's public API.
 *
 *   npm run build
 *   node scripts/discover-italian-employers.mjs [out.json]
 */
import { writeFileSync } from 'node:fs';
import { matchesCountry, isRelevantRole, isFresh } from '../dist/market.js';
import { greenhouse } from '../dist/sources/greenhouse.js';
import { lever } from '../dist/sources/lever.js';
import { ashby } from '../dist/sources/ashby.js';
import { workable } from '../dist/sources/workable.js';
import { teamtailor } from '../dist/sources/teamtailor.js';
import { recruitee } from '../dist/sources/recruitee.js';
import { smartrecruiters } from '../dist/sources/smartrecruiters.js';

const SOURCES = { greenhouse, lever, ashby, workable, teamtailor, recruitee, smartrecruiters };
const outPath = process.argv[2] ?? '.jobhopper/tmp-e2e/italy-employers.json';

// Italian tech / scaleups / enterprises worth probing. Domains, not ATS guesses.
const COMPANIES = [
  ['Satispay', 'satispay.com'], ['Scalapay', 'scalapay.com'], ['Bending Spoons', 'bendingspoons.com'],
  ['Musixmatch', 'musixmatch.com'], ['Prima', 'prima.it'], ['Everli', 'everli.com'],
  ['Cortilia', 'cortilia.it'], ['Milkman', 'milkman.it'], ['Tannico', 'tannico.it'],
  ['Young Platform', 'youngplatform.com'], ['Moneyfarm', 'moneyfarm.com'], ['Hype', 'hype.it'],
  ['Illimity', 'illimity.com'], ['Fabrick', 'fabrick.com'], ['Nexi', 'nexi.it'],
  ['Dedalus', 'dedalus.com'], ['Engineering', 'eng.it'], ['TeamSystem', 'teamsystem.com'],
  ['Zucchetti', 'zucchetti.it'], ['Cleafy', 'cleafy.com'], ['iGenius', 'igenius.ai'],
  ['ShippyPro', 'shippypro.com'], ['Arduino', 'arduino.cc'], ['Musement', 'musement.com'],
  ['Talent Garden', 'talentgarden.org'], ['Immobiliare.it', 'immobiliare.it'],
  ['Subito', 'subito.it'], ['Docebo', 'docebo.com'], ['Mollie', 'mollie.com'],
  ['Job&Talent', 'jobandtalent.com'], ['Glovo', 'glovoapp.com'], ['Banca AideXa', 'aidexa.it'],
  ['Viceversa', 'viceversa.com'], ['Oval Money', 'ovalmoney.com'], ['Soldo', 'soldo.com'],
  ['Treedom', 'treedom.net'], ['Bcome', 'bcome.it'], ['Aworld', 'aworld.org'],
  ['Seasy', 'seasy.it'], ['Cents', 'cents.com'],
];

const ATS_PATTERNS = [
  [/(?:job-boards|boards)\.greenhouse\.io\/([a-z0-9_-]+)/i, 'greenhouse'],
  [/jobs\.lever\.co\/([a-z0-9_-]+)/i, 'lever'],
  [/jobs\.ashbyhq\.com\/([a-z0-9_.-]+)/i, 'ashby'],
  [/apply\.workable\.com\/([a-z0-9_-]+)/i, 'workable'],
  [/(?!(?:app|www|docs|support|api)\.)([a-z0-9-]+)\.teamtailor\.com/i, 'teamtailor'],
  [/(?!(?:app|www|docs|support|api)\.)([a-z0-9-]+)\.recruitee\.com/i, 'recruitee'],
  [/careers\.smartrecruiters\.com\/([a-z0-9_-]+)/i, 'smartrecruiters'],
];
const CAREERS_PATHS = ['/careers', '/jobs', '/lavora-con-noi', '/join-us'];

async function get(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'jobhopper/0.1 (+local job search)', Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const found = new Map();
for (const [name, domain] of COMPANIES) {
  const urls = [`https://${domain}/`, ...CAREERS_PATHS.map((p) => `https://${domain}${p}`)];
  for (const url of urls) {
    let html;
    try { html = await get(url); } catch { continue; }
    for (const [re, ats] of ATS_PATTERNS) {
      const m = html.match(re);
      if (!m) continue;
      const token = m[1].toLowerCase().replace(/\.$/, '');
      const key = `${ats}:${token}`;
      if (!found.has(key)) {
        found.set(key, { name, ats, token });
        console.log(`+ ${name} -> ${ats}:${token} (from ${url})`);
      }
    }
  }
}

console.log(`\nfound ${found.size} boards; probing for Italy…`);
const hits = [];
for (const board of found.values()) {
  try {
    const jobs = await SOURCES[board.ats].fetchCompany({ name: board.name, token: board.token });
    const italy = jobs.filter((j) => matchesCountry(j.location, 'Italy'));
    const rel = italy.filter((j) => isRelevantRole(j.title));
    const fresh = rel.filter((j) => isFresh(j.postedAt, new Date(), true));
    if (fresh.length) {
      hits.push({ ...board, total: jobs.length, italy: italy.length, relevant: rel.length, fresh: fresh.length, samples: fresh.slice(0, 3).map((j) => `${j.title} — ${j.location}`) });
      console.log(`  ${board.ats}:${board.token} ${fresh.length} fresh relevant / ${italy.length} Italy / ${jobs.length}`);
    }
  } catch { /* dead board */ }
}
hits.sort((a, b) => b.fresh - a.fresh);
writeFileSync(outPath, `${JSON.stringify(hits, null, 2)}\n`);
console.log(`\n${hits.length} boards with fresh Italian roles -> ${outPath}`);
