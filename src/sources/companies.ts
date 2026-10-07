export type AtsKind = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'teamtailor' | 'recruitee';

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
function tt(name: string, token: string): CompanyEntry {
  return { name, ats: 'teamtailor', token };
}
function wk(name: string, token: string): CompanyEntry {
  return { name, ats: 'workable', token };
}
function as(name: string, token: string): CompanyEntry {
  return { name, ats: 'ashby', token };
}
function rc(name: string, token: string): CompanyEntry {
  return { name, ats: 'recruitee', token };
}

/**
 * Default registry — Dutch and European technology companies (plus a few
 * remote-friendly international ones) that expose public Greenhouse, Lever,
 * Ashby, Workable or Teamtailor boards. Tokens below were verified live
 * against the public APIs.
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

  // Netherlands — live-verified --------------------------------------------------------------
  gh('Adyen', 'adyen'),
  gh('Bol.com', 'bolcom'),
  gh('MessageBird', 'bird'),
  gh('Optiver', 'optiver'),
  gh('Trustpilot', 'trustpilot'),

  // Europe — live-verified (Germany / France / UK / BENELUX) ----------------------------------
  lv('Spotify', 'spotify'),
  gh('N26', 'n26'),
  gh('Monzo', 'monzo'),
  gh('GoCardless', 'gocardless'),
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
  gh('Fivetran', 'fivetran'),
  gh('Mixpanel', 'mixpanel'),
  gh('MongoDB', 'mongodb'),
  gh('Netlify', 'netlify'),
  gh('Okta', 'okta'),
  gh('PlanetScale', 'planetscale'),
  as('Firecrawl', 'firecrawl'),
  as('OpenAI', 'openai'),
  // Imported from the public careers tracker; each board verified to list NL/IT/ES jobs.
  as('Hopper', 'hopper'),
  gh('Appodeal', 'appodeal'),
  gh('OpenTable', 'opentable'),
  as('Kraken', 'kraken.com'),
  gh('WPP Media', 'wppmedia'),
  as('Jellyfish Digital Group Limited', 'jellyfishcareers'),
  gh('Vonage', 'vonage'),
  lv('Jeeves Inc.', 'tryjeeves'),
  gh('Redwood Software', 'redwoodsoftware'),
  lv('Yuno', 'yuno'),
  lv('Canary Technologies', 'canarytechnologies'),
  gh('Atlas HXM', 'atlasxhm'),
  gh('xAI', 'xai'),
  gh('Revlon Manufacturing & Distribution', 'revlonmanufacturing'),
  gh('Uber Freight', 'uberfreight'),
  lv('Lyra Health, Inc.', 'lyrahealth'),
  lv('Palantir Technologies Inc.', 'palantir'),
  gh('B12', 'b12'),
  as('Maze', 'mazedesign'),
  lv('truv', 'truv'),
  as('Oyster HR, Inc', 'oyster'),
  lv('ContentSquare', 'contentsquare'),
  gh('Affirm', 'affirm'),
  gh('HumanSignal', 'humansignal'),
  gh('Grafana Labs', 'grafanalabs'),
  gh('Diligent Corporation', 'diligentcorporation'),
  as('Luminovo', 'luminovo'),
  as('Onebrief', 'onebrief'),
  gh('Planet Labs PBC', 'planetlabs'),
  gh('NetEase Games', 'neteasegames'),
  gh('Tenstorrent', 'tenstorrent'),
  gh('Revlon Corporate', 'revloncorporate'),
  lv('Welo Global', 'weloglobal'),
  gh('Rithum', 'rithum'),
  as('Tempo Software', 'tempo-io'),
  lv('Foxit', 'foxitsoftware'),
  gh('Convera', 'convera'),
  gh('OKX', 'okx'),
  lv('IDT', 'idt'),
  gh('Tenable, Inc.', 'tenableinc'),
  gh('Quince', 'quince'),
  gh('Geotab', 'geotab'),
  gh('G-P', 'globalizationpartners'),
  as('HappyRobot Inc.', 'happyrobot.ai'),
  gh('Nuitée', 'nuitee'),
  lv('Addition Wealth', 'additionwealth'),
  gh('Zscaler', 'zscaler'),
  as('ICEYE', 'iceye'),
  lv('Unlimit', 'unlimit'),
  gh('Wellhub', 'gympass'),
  as('LemFi', 'lemfi'),
  gh('Anthropic', 'anthropic'),
  lv('Penumbra, Inc.', 'penumbrainc'),
  gh('Foundation Risk Partners', 'foundationriskpartners'),
  lv('ION', 'ion'),
  as('WeTravel', 'wetravel'),
  lv('Adlook', 'adlook'),
  as('Orchard Robotics', 'orchard'),
  as('Polène', 'polene-paris'),
  as('Eleven Labs', 'elevenlabs'),
  as('Sierra', 'sierra'),
  as('Legora', 'legora'),
  gh('Together AI', 'togetherai'),
  lv('Zimperium', 'zimperium'),
  gh('General Atlantic', 'generalatlantic'),
  gh('Impact', 'impact'),
  gh('WorldStrides', 'world4822stri986des'),
  gh('Telnyx', 'telnyx54'),
  lv('Shield AI', 'shieldai'),
  wk('Cleafy', 'cleafy'),
  tt('TLC Worldwide', 'tlcworldwide'),
  tt('THE/STUDIO', 'thestudio.na'),
  tt('North Star Network (NSN)', 'northstarnetwork-1711439398'),
  tt('Teamtailor (own careers)', 'career'),
  wk('Channel Factory', 'channel-factory'),
  wk('Wati', 'wati-dot-i-o'),
  wk('Flosum', 'flosum'),
  wk('Partner One Capital', 'partner-one-capital'),
  wk('GoGlobal', 'goglobal'),
  wk('Decentralized Masters', 'decentralized-masters'),
  wk('Genetec', 'genetec-inc'),
  wk('Omilia Natural Language Solutions', 'omilia-natural-language-solutions-ua-ltd'),
  wk('Cache Ventures', 'cache'),
  wk('Crystalia Glass', 'crystalia-glass'),
  wk('Deep Science Ventures (DSV)', 'deep-science-ventures'),
  wk('Bask Health', 'bask-health-1'),
  wk('Keycafe', 'keycafe'),
  wk('UMAEZ', 'umaez-llc'),
  wk('Control Risks', 'control-risks-6'),
  wk('Laravel', 'laravel'),
  wk('Oppizi', 'oppizi'),
  rc('Dss', 'consultdss'),
];