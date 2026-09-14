export type AtsKind = 'greenhouse' | 'lever' | 'ashby';

export interface CompanyEntry {
  name: string;
  ats: AtsKind;
  token: string;
}

function gh(name: string, token: string): CompanyEntry {
  return { name, ats: 'greenhouse', token };
}
function lv(name: string, token: string): CompanyEntry {
  return { name, ats: 'lever', token };
}
function as(name: string, token: string): CompanyEntry {
  return { name, ats: 'ashby', token };
}

/**
 * Default registry — Dutch and European technology companies (plus a few
 * remote-friendly international ones) that expose public Greenhouse/Lever/
 * Ashby boards. Tokens below were verified live against the public APIs.
 *
 * Run `jobhopper companies verify` to re-check live, and `jobhopper scan -a`
 * to also pull whole-market remote aggregators (Remotive, RemoteOK) which need
 * no curated list at all. scan() reports individual failures without aborting,
 * so a dead token is visible, not fatal.
 */
export const DEFAULT_COMPANIES: CompanyEntry[] = [
  // Netherlands — live-verified --------------------------------------------------------------
  gh('Adyen', 'adyen'),
  gh('Bol.com', 'bolcom'),
  gh('MessageBird', 'bird'),
  gh('Optiver', 'optiver'),
  gh('Sendcloud', 'sendcloud'),

  // Europe — live-verified (Germany / France / UK / BENELUX) ----------------------------------
  lv('Spotify', 'spotify'),
  gh('N26', 'n26'),
  gh('Monzo', 'monzo'),
  gh('GoCardless', 'gocardless'),
  lv('Wise', 'wise'),
  gh('Algolia', 'algolia'),
  gh('Doctolib', 'doctolib'),
  gh('Trivago', 'trivago'),
  gh('Remote', 'remote'),
  gh('JetBrains', 'jetbrains'),
  gh('Spryker', 'spryker'),
  gh('GitLab', 'gitlab'),
  gh('Elastic', 'elastic'),
  gh('Contentful', 'contentful'),
  gh('HelloFresh', 'hellofresh'),

  // Remote-friendly international (live-verified) ----------------------------------------------
  gh('Stripe', 'stripe'),
  gh('Datadog', 'datadog'),
  gh('Figma', 'figma'),
  gh('Dropbox', 'dropbox'),
  gh('Duolingo', 'duolingo'),
  gh('Mozilla', 'mozilla'),
  gh('Reddit', 'reddit'),
  gh('Discord', 'discord'),
  gh('Twilio', 'twilio'),
  as('Firecrawl', 'firecrawl'),
  as('OpenAI', 'openai'),
  as('Anthropic', 'anthropic'),
];