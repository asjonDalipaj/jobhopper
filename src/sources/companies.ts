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
 *
 * Market focus is Italy/Spain/Netherlands (see src/market.ts) — scan-time
 * filtering drops everything else, so multinationals below only contribute
 * their IT/ES/NL postings.
 */
export const DEFAULT_COMPANIES: CompanyEntry[] = [
  // Italy/Spain/Netherlands headquartered or heavy — live-verified -----------------------------
  as('Mollie', 'mollie'),
  as('Docebo', 'docebo'),
  as('Satispay', 'satispay'),
  as('Bynder', 'bynder'),
  lv('Job&Talent', 'jobandtalent'),
  gh('Wallapop', 'wallapop'),
  gh('ClarityAI', 'clarityai'),

  // Netherlands — live-verified --------------------------------------------------------------
  gh('Adyen', 'adyen'),
  gh('Bol.com', 'bolcom'),
  gh('MessageBird', 'bird'),
  gh('Optiver', 'optiver'),
  gh('Sendcloud', 'sendcloud'),
  gh('Trustpilot', 'trustpilot'),

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
  gh('Typeform', 'typeform'),
  gh('Wayve', 'wayve'),
  gh('Wunderflats', 'wunderflats'),
  gh('Neo4j', 'neo4j'),

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
  gh('Cloudflare', 'cloudflare'),
  gh('Vercel', 'vercel'),
  gh('Intercom', 'intercom'),
  gh('Coinbase', 'coinbase'),
  gh('Robinhood', 'robinhood'),
  gh('Airbnb', 'airbnb'),
  gh('Twitch', 'twitch'),
  gh('Amplitude', 'amplitude'),
  gh('Fivetran', 'fivetran'),
  gh('HubSpot', 'hubspot'),
  gh('Mixpanel', 'mixpanel'),
  gh('MongoDB', 'mongodb'),
  gh('Netlify', 'netlify'),
  gh('Okta', 'okta'),
  gh('PlanetScale', 'planetscale'),
  as('Firecrawl', 'firecrawl'),
  as('OpenAI', 'openai'),
  as('Anthropic', 'anthropic'),
];