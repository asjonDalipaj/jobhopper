/**
 * Cloudflare Worker: the reliable scheduler for JobHopper.
 *
 * GitHub's own `schedule` trigger is best-effort and drops runs at the top of
 * the hour (which is exactly where our 3-hour cron sat). This Worker runs on
 * Cloudflare's cron trigger instead and dispatches the GitHub workflow through
 * the API. The scan itself still runs on GitHub Actions; only the trigger moves.
 *
 * Required secret: GITHUB_DISPATCH_TOKEN
 *   fine-grained PAT, repository = this repo, permission Actions: Read and write.
 */

const API_VERSION = '2022-11-28';

export default {
  async scheduled(_event, env, _ctx) {
    await dispatch(env);
  },

  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') {
      return Response.json({ ok: true, worker: 'jobhopper-dispatch', cron: '17 */3 * * *' });
    }
    return new Response('jobhopper dispatch: cron only\n', { status: 404 });
  },
};

async function dispatch(env) {
  const token = env.GITHUB_DISPATCH_TOKEN;
  if (!token) throw new Error('GITHUB_DISPATCH_TOKEN is not set');
  const repo = env.GITHUB_REPO;
  const workflow = env.WORKFLOW_FILE;
  const ref = env.GITHUB_REF || 'main';

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'jobhopper-dispatch-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub dispatch failed ${res.status}: ${body.slice(0, 300)}`);
  }
  console.log(`dispatched ${repo} ${workflow} @ ${ref} (${res.status})`);
}
