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
 * scan() reports individual failures without aborting the run, so a dead
 * token is visible, not fatal. Extend via `jobhopper companies add`.
 */
export const DEFAULT_COMPANIES: CompanyEntry[] = [
  // Netherlands — verified ------------------------------------------------------------------
  gh('Bol.com', 'bolcom'),
  gh('Adyen', 'adyen'),
  gh('MessageBird', 'bird'),

  // Netherlands — commonly used public tokens (may be gated or renamed) ----------------------
  gh('Mollie', 'mollie'),
  gh('Backbase', 'backbase'),
  gh('Bunq', 'bunq'),
  gh('Picnic', 'picnic-technologies'),
  gh('Channable', 'channable'),
  gh('Funda', 'funda'),
  gh('Exact', 'exact'),
  lv('Moneybird', 'moneybird'),
  gh('TomTom', 'tomtom'),
  gh('Philips', 'philips'),
  gh('Rabobank', 'rabobank'),

  // Europe — verified -------------------------------------------------------------------------
  gh('JetBrains', 'jetbrains'),
  gh('Spryker', 'spryker'),
  lv('Spotify', 'spotify'),
  gh('GitLab', 'gitlab'),
  gh('Elastic', 'elastic'),
  gh('Contentful', 'contentful'),
  gh('HelloFresh', 'hellofresh'),

  // Remote-friendly international (verified) --------------------------------------------------
  gh('Stripe', 'stripe'),
  gh('Datadog', 'datadog'),
  gh('Figma', 'figma'),
  gh('Dropbox', 'dropbox'),
  gh('Duolingo', 'duolingo'),
  gh('Mozilla', 'mozilla'),
  gh('Reddit', 'reddit'),
  gh('Discord', 'discord'),
  gh('Twilio', 'twilio'),
  gh('GitHub', 'github'),
  as('Firecrawl', 'firecrawl'),
  as('OpenAI', 'openai'),
  as('Anthropic', 'anthropic'),
];