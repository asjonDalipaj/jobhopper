/**
 * Location taxonomy for the location/region filter.
 *
 * Job "location" strings are inconsistent free-form text: some list only a city
 * ("Amsterdam", "Utrecht"), some "City, Country", some a bare country, some
 * several locations at once (joined by ";", "/", "or", "·"). A raw substring
 * filter therefore misses city-only rows (e.g. "Utrecht" contains no
 * "Netherlands"), and a comma-split dropdown produces bogus options like
 * "Amsterdam" sitting next to "Netherlands".
 *
 * This module normalizes a location string into a set of recognized places
 * (cities -> country, countries/regions -> continent) so that filtering by a
 * continent ("Europe") or a country ("Netherlands") matches any job whose
 * location mentions Amsterdam, Utrecht, Berlin, etc., no matter how it's written.
 */

export type Continent =
  | 'Europe'
  | 'North America'
  | 'South America'
  | 'Asia'
  | 'Oceania'
  | 'Africa';

export const CONTINENTS: Continent[] = [
  'Europe',
  'North America',
  'South America',
  'Asia',
  'Oceania',
  'Africa',
];

export interface Place {
  country: string;
  continent: Continent;
}

export interface LocationGroupOptions {
  continent: Continent;
  /** Countries present in the data for this continent, sorted alphabetically. */
  countries: string[];
}

/* Lowercase, accent-free key used for all lookups. */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/* Match a needle inside a haystack only on word boundaries, so a city name is
 * never matched as a substring of a longer word. */
function boundaryHit(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

/**
 * Every known city, grouped by (canonical) country. All spellings are listed;
 * they are matched accent-insensitively, so "München" and "Munich" both hit.
 */
const CITIES_BY_COUNTRY: Record<string, { continent: Continent; names: string[] }> = {
  Netherlands: {
    continent: 'Europe',
    names: [
      'Amsterdam',
      'Amsterdam, The Netherlands',
      'Utrecht',
      'Rotterdam',
      'Den Haag',
      'The Hague',
      'Eindhoven',
      'Groningen',
      'Delft',
      'Leiden',
      'Tilburg',
      'Haarlem',
      'Arnhem',
      'Breda',
      'Nijmegen',
      'Enschede',
    ],
  },
  Germany: {
    continent: 'Europe',
    names: [
      'Berlin',
      'Munich',
      'München',
      'Hamburg',
      'Cologne',
      'Köln',
      'Frankfurt',
      'Frankfurt am Main',
      'Stuttgart',
      'Düsseldorf',
      'Dusseldorf',
      'Leipzig',
      'Dresden',
      'Nuremberg',
      'Nürnberg',
      'Hannover',
      'Hanover',
      'Bonn',
      'Dortmund',
      'Essen',
      'Bremen',
      'Mannheim',
      'Karlsruhe',
      'Münster',
      'Munster',
      'Aachen',
      'Heidelberg',
      'Freiburg',
      'Ulm',
      'Augsburg',
      'Kiel',
      'Mainz',
      'Wuppertal',
      'Bochum',
      'Regensburg',
      'Erlangen',
      'Jena',
      'Ingolstadt',
      'Saarbrücken',
    ],
  },
  France: {
    continent: 'Europe',
    names: [
      'Paris',
      'Lyon',
      'Marseille',
      'Toulouse',
      'Lille',
      'Bordeaux',
      'Nice',
      'Strasbourg',
      'Nantes',
      'Montpellier',
      'Grenoble',
      'Rennes',
      'Annecy',
      'Pau',
      'Aix-en-Provence',
      'Aix en Provence',
      'Sophia Antipolis',
      'Biarritz',
      'Clermont-Ferrand',
      'Reims',
      'Rouen',
      'Versailles',
    ],
  },
  'United Kingdom': {
    continent: 'Europe',
    names: [
      'London',
      'Manchester',
      'Birmingham',
      'Leeds',
      'Glasgow',
      'Edinburgh',
      'Bristol',
      'Liverpool',
      'Cardiff',
      'Belfast',
      'Newcastle',
      'Newcastle upon Tyne',
      'Nottingham',
      'Sheffield',
      'Cambridge',
      'Oxford',
      'Southampton',
      'Reading',
      'Brighton',
      'Aberdeen',
      'Derby',
      'Bath',
      'Leicester',
      'Coventry',
      'Milton Keynes',
      'Portsmouth',
      'Plymouth',
    ],
  },
  Ireland: {
    continent: 'Europe',
    names: ['Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Sligo'],
  },
  Spain: {
    continent: 'Europe',
    names: [
      'Madrid',
      'Barcelona',
      'Valencia',
      'Seville',
      'Sevilla',
      'Bilbao',
      'Málaga',
      'Malaga',
      'Zaragoza',
      'Granada',
      'Alicante',
      'Pamplona',
      'A Coruña',
      'Palma',
      'Palma de Mallorca',
    ],
  },
  Italy: {
    continent: 'Europe',
    names: [
      'Milan',
      'Milano',
      'Rome',
      'Roma',
      'Turin',
      'Torino',
      'Bologna',
      'Florence',
      'Firenze',
      'Naples',
      'Napoli',
      'Verona',
      'Genoa',
      'Genova',
      'Venice',
      'Venezia',
      'Palermo',
      'Bergamo',
      'Como',
      'Pisa',
    ],
  },
  Portugal: {
    continent: 'Europe',
    names: ['Lisbon', 'Lisboa', 'Porto', 'Braga', 'Coimbra', 'Aveiro'],
  },
  Sweden: {
    continent: 'Europe',
    names: [
      'Stockholm',
      'Gothenburg',
      'Göteborg',
      'Malmö',
      'Malmo',
      'Uppsala',
      'Linköping',
      'Linkoping',
      'Lund',
      'Helsingborg',
      'Örebro',
    ],
  },
  Denmark: {
    continent: 'Europe',
    names: ['Copenhagen', 'København', 'Aarhus', 'Århus', 'Aalborg', 'Odense', 'Esbjerg'],
  },
  Finland: {
    continent: 'Europe',
    names: ['Helsinki', 'Espoo', 'Tampere', 'Oulu', 'Turku'],
  },
  Norway: {
    continent: 'Europe',
    names: ['Oslo', 'Bergen', 'Trondheim', 'Stavanger'],
  },
  Austria: {
    continent: 'Europe',
    names: ['Vienna', 'Wien', 'Graz', 'Linz', 'Innsbruck', 'Salzburg'],
  },
  Switzerland: {
    continent: 'Europe',
    names: [
      'Zurich',
      'Zürich',
      'Geneva',
      'Genève',
      'Bern',
      'Berne',
      'Basel',
      'Lausanne',
      'Lucerne',
      'Luzern',
    ],
  },
  Belgium: {
    continent: 'Europe',
    names: [
      'Brussels',
      'Brussel',
      'Bruxelles',
      'Antwerp',
      'Antwerpen',
      'Ghent',
      'Gent',
      'Leuven',
      'Louvain',
      'Charleroi',
      'Bruges',
      'Brugge',
    ],
  },
  Poland: {
    continent: 'Europe',
    names: [
      'Warsaw',
      'Warszawa',
      'Kraków',
      'Krakow',
      'Cracow',
      'Wrocław',
      'Wroclaw',
      'Gdańsk',
      'Gdansk',
      'Poznań',
      'Poznan',
      'Łódź',
      'Lodz',
      'Lublin',
      'Katowice',
      'Gdynia',
      'Bydgoszcz',
      'Białystok',
    ],
  },
  'Czech Republic': {
    continent: 'Europe',
    names: ['Prague', 'Praha', 'Brno', 'Ostrava', 'Pilsen', 'Plzeň', 'Liberec'],
  },
  Greece: {
    continent: 'Europe',
    names: ['Athens', 'Athina', 'Thessaloniki', 'Piraeus', 'Patras', 'Heraklion'],
  },
  Slovenia: {
    continent: 'Europe',
    names: ['Ljubljana', 'Maribor', 'Celje'],
  },
  Croatia: {
    continent: 'Europe',
    names: ['Zagreb', 'Split', 'Rijeka', 'Osijek'],
  },
  Serbia: {
    continent: 'Europe',
    names: ['Novi Sad', 'Belgrade', 'Beograd', 'Niš', 'Nis'],
  },
  Estonia: {
    continent: 'Europe',
    names: ['Tallinn', 'Tartu'],
  },
  Latvia: {
    continent: 'Europe',
    names: ['Riga', 'Daugavpils'],
  },
  Lithuania: {
    continent: 'Europe',
    names: ['Vilnius', 'Kaunas', 'Klaipėda', 'Klaipeda'],
  },
  Cyprus: {
    continent: 'Europe',
    names: ['Nicosia', 'Limassol'],
  },
  Hungary: {
    continent: 'Europe',
    names: ['Budapest', 'Debrecen', 'Szeged'],
  },
  Slovakia: {
    continent: 'Europe',
    names: ['Bratislava', 'Kosice', 'Košice'],
  },
  Romania: {
    continent: 'Europe',
    names: [
      'Bucharest',
      'Bucuresti',
      'București',
      'Cluj-Napoca',
      'Cluj',
      'Timisoara',
      'Timișoara',
      'Iasi',
      'Iași',
      'Brasov',
      'Brașov',
    ],
  },
  Bulgaria: {
    continent: 'Europe',
    names: ['Sofia', 'Plovdiv', 'Varna', 'Burgas'],
  },
  Malta: {
    continent: 'Europe',
    names: ['Valletta', 'Birkirkara', 'Mosta'],
  },
  Iceland: {
    continent: 'Europe',
    names: ['Reykjavik', 'Reykjavík'],
  },
  Luxembourg: {
    continent: 'Europe',
    names: ['Luxembourg', 'Luxembourg City'],
  },
  Ukraine: {
    continent: 'Europe',
    names: ['Kyiv', 'Kiev', 'Lviv', 'Kharkiv', 'Odessa', 'Odesa'],
  },
  'United States': {
    continent: 'North America',
    names: [
      'San Francisco',
      'New York',
      'New York City',
      'NYC',
      'Los Angeles',
      'Seattle',
      'Austin',
      'Chicago',
      'Denver',
      'Boston',
      'Bellevue',
      'Menlo Park',
      'Charlotte',
      'Arlington',
      'Irving',
      'Sunnyvale',
      'Mountain View',
      'Newark',
      'Oakland',
      'Washington',
      'Washington DC',
      'Washington, D.C.',
      'Philadelphia',
      'Boulder',
      'Goodyear',
      'Aurora',
      'Palo Alto',
      'San Jose',
      'Dallas',
      'Houston',
      'Miami',
      'Detroit',
      'Atlanta',
      'Portland',
      'San Diego',
      'Minneapolis',
      'Phoenix',
      'Nashville',
      'Salt Lake City',
      'California',
      'Texas',
      'Illinois',
      'Massachusetts',
      'Pennsylvania',
      'Virginia',
      'New Jersey',
      'North Carolina',
      'Colorado',
      'Georgia',
      'Michigan',
      'Ohio',
      'Wisconsin',
      'Florida',
      'Connecticut',
      'Maryland',
      'Arizona',
      'Nevada',
      'Oregon',
      'Utah',
      'Minnesota',
      'Missouri',
      'Tennessee',
      'Indiana',
      'District of Columbia',
    ],
  },
  Canada: {
    continent: 'North America',
    names: [
      'Toronto',
      'Vancouver',
      'Abbotsford',
      'Montreal',
      'Montréal',
      'Ottawa',
      'Calgary',
      'Edmonton',
      'Waterloo',
      'British Columbia',
      'Ontario',
      'Quebec',
      'Québec',
      'Alberta',
      'Manitoba',
      'Nova Scotia',
      'Saskatchewan',
    ],
  },
  Mexico: {
    continent: 'North America',
    names: ['Mexico City', 'Ciudad de México', 'CDMX', 'Monterrey', 'Guadalajara'],
  },
  'Costa Rica': {
    continent: 'North America',
    names: ['San José', 'San Jose', 'Costa Rica'],
  },
  India: {
    continent: 'Asia',
    names: [
      'Bangalore',
      'Bengaluru',
      'Mumbai',
      'Bombay',
      'Delhi',
      'Gurugram',
      'Gurgaon',
      'Hyderabad',
      'Pune',
      'Chennai',
      'Madras',
      'Noida',
      'Kolkata',
      'Ahmedabad',
      'Jaipur',
      'Lucknow',
    ],
  },
  Japan: {
    continent: 'Asia',
    names: ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Nagoya', 'Fukuoka', 'Sapporo', 'Ibaraki'],
  },
  Singapore: {
    continent: 'Asia',
    names: ['Singapore'],
  },
  'Hong Kong': {
    continent: 'Asia',
    names: ['Hong Kong'],
  },
  'South Korea': {
    continent: 'Asia',
    names: ['Seoul', 'Busan', 'Incheon', 'Gyeonggi'],
  },
  Israel: {
    continent: 'Asia',
    names: ['Tel Aviv', 'Tel Aviv-Yafo', 'Haifa', 'Jerusalem', 'Herzliya'],
  },
  'United Arab Emirates': {
    continent: 'Asia',
    names: ['Dubai', 'Abu Dhabi'],
  },
  'Saudi Arabia': {
    continent: 'Asia',
    names: ['Riyadh', 'Jeddah', 'KSA'],
  },
  Turkey: {
    continent: 'Asia',
    names: ['Istanbul', 'Ankara', 'Izmir'],
  },
  Philippines: {
    continent: 'Asia',
    names: ['Manila', 'Cebu', 'Quezon City', 'Makati'],
  },
  Indonesia: {
    continent: 'Asia',
    names: ['Jakarta'],
  },
  Thailand: {
    continent: 'Asia',
    names: ['Bangkok'],
  },
  Malaysia: {
    continent: 'Asia',
    names: ['Kuala Lumpur', 'Selangor'],
  },
  'Sri Lanka': {
    continent: 'Asia',
    names: ['Colombo'],
  },
  Australia: {
    continent: 'Oceania',
    names: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Gold Coast'],
  },
  'New Zealand': {
    continent: 'Oceania',
    names: ['Auckland', 'Wellington', 'Christchurch'],
  },
  Brazil: {
    continent: 'South America',
    names: ['São Paulo', 'Sao Paulo', 'Rio de Janeiro', 'Rio', 'Belo Horizonte', 'Florianópolis', 'Curitiba', 'Porto Alegre'],
  },
  Argentina: {
    continent: 'South America',
    names: ['Buenos Aires'],
  },
  Chile: {
    continent: 'South America',
    names: ['Santiago'],
  },
  Peru: {
    continent: 'South America',
    names: ['Lima'],
  },
  'South Africa': {
    continent: 'Africa',
    names: ['Cape Town', 'Johannesburg'],
  },
};
/* ---- Bare country / region names that can appear on their own (e.g. "Germany").
 * Keys are the canonical country names; aliases are the spelling variants
 * searched for in a location string. */
const COUNTRY_ALIASES: Record<string, { aliases: string[]; continent: Continent }> = {
  Netherlands: { continent: 'Europe', aliases: ['netherlands', 'the netherlands', 'holland'] },
  Germany: { continent: 'Europe', aliases: ['germany'] },
  France: { continent: 'Europe', aliases: ['france'] },
  Spain: { continent: 'Europe', aliases: ['spain'] },
  Italy: { continent: 'Europe', aliases: ['italy'] },
  Portugal: { continent: 'Europe', aliases: ['portugal'] },
  Sweden: { continent: 'Europe', aliases: ['sweden'] },
  Denmark: { continent: 'Europe', aliases: ['denmark'] },
  Finland: { continent: 'Europe', aliases: ['finland'] },
  Norway: { continent: 'Europe', aliases: ['norway'] },
  Austria: { continent: 'Europe', aliases: ['austria'] },
  Switzerland: { continent: 'Europe', aliases: ['switzerland', 'swiss'] },
  Belgium: { continent: 'Europe', aliases: ['belgium'] },
  Poland: { continent: 'Europe', aliases: ['poland'] },
  'Czech Republic': { continent: 'Europe', aliases: ['czech republic', 'czech'] },
  Greece: { continent: 'Europe', aliases: ['greece'] },
  Slovenia: { continent: 'Europe', aliases: ['slovenia'] },
  Croatia: { continent: 'Europe', aliases: ['croatia'] },
  Serbia: { continent: 'Europe', aliases: ['serbia'] },
  Estonia: { continent: 'Europe', aliases: ['estonia'] },
  Latvia: { continent: 'Europe', aliases: ['latvia'] },
  Lithuania: { continent: 'Europe', aliases: ['lithuania'] },
  Cyprus: { continent: 'Europe', aliases: ['cyprus'] },
  Hungary: { continent: 'Europe', aliases: ['hungary'] },
  Slovakia: { continent: 'Europe', aliases: ['slovakia'] },
  Romania: { continent: 'Europe', aliases: ['romania'] },
  Bulgaria: { continent: 'Europe', aliases: ['bulgaria'] },
  Malta: { continent: 'Europe', aliases: ['malta'] },
  Iceland: { continent: 'Europe', aliases: ['iceland'] },
  Luxembourg: { continent: 'Europe', aliases: ['luxembourg'] },
  Ukraine: { continent: 'Europe', aliases: ['ukraine'] },
  'United Kingdom': {
    continent: 'Europe',
    aliases: ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'england', 'scotland', 'wales'],
  },
  Ireland: { continent: 'Europe', aliases: ['ireland', 'irl'] },
  'United States': {
    continent: 'North America',
    aliases: ['united states', 'united states of america', 'usa', 'u.s.a.', 'u.s.', 'us'],
  },
  Canada: { continent: 'North America', aliases: ['canada'] },
  Mexico: { continent: 'North America', aliases: ['mexico'] },
  'Costa Rica': { continent: 'North America', aliases: ['costa rica'] },
  India: { continent: 'Asia', aliases: ['india'] },
  Japan: { continent: 'Asia', aliases: ['japan'] },
  Singapore: { continent: 'Asia', aliases: ['singapore'] },
  'Hong Kong': { continent: 'Asia', aliases: ['hong kong'] },
  'South Korea': { continent: 'Asia', aliases: ['south korea', 'korea'] },
  Israel: { continent: 'Asia', aliases: ['israel'] },
  'United Arab Emirates': { continent: 'Asia', aliases: ['united arab emirates', 'uae'] },
  'Saudi Arabia': { continent: 'Asia', aliases: ['saudi arabia', 'saudi', 'ksa'] },
  Turkey: { continent: 'Asia', aliases: ['turkey'] },
  Philippines: { continent: 'Asia', aliases: ['philippines'] },
  Malaysia: { continent: 'Asia', aliases: ['malaysia'] },
  Thailand: { continent: 'Asia', aliases: ['thailand'] },
  Australia: { continent: 'Oceania', aliases: ['australia'] },
  'New Zealand': { continent: 'Oceania', aliases: ['new zealand'] },
  Brazil: { continent: 'South America', aliases: ['brazil'] },
  Argentina: { continent: 'South America', aliases: ['argentina'] },
  Chile: { continent: 'South America', aliases: ['chile'] },
  Colombia: { continent: 'South America', aliases: ['colombia'] },
  Peru: { continent: 'South America', aliases: ['peru'] },
  'South Africa': { continent: 'Africa', aliases: ['south africa'] },
};

/* Continents that can be named directly in a location string, plus the region
 * codes boards love to use (EMEA / APAC / AMER / DACH / EU). */
const CONTINENT_TOKENS: Record<Continent, string[]> = {
  Europe: ['europe', 'eu', 'emea', 'dach'],
  'North America': ['north america', 'amer', 'americas'],
  'South America': ['south america'],
  Asia: ['asia', 'apac'],
  Oceania: ['oceania'],
  Africa: ['africa'],
};

/* ---- Lookup indexes built once at module load ---- */
const cityIndex = new Map<string, Place>();
for (const [country, entry] of Object.entries(CITIES_BY_COUNTRY)) {
  for (const name of entry.names) {
    const key = normalize(name.trim());
    if (key) cityIndex.set(key, { country, continent: entry.continent });
  }
}

const countryAliasIndex = new Map<string, Place>();
for (const [country, entry] of Object.entries(COUNTRY_ALIASES)) {
  for (const alias of entry.aliases) {
    countryAliasIndex.set(normalize(alias.trim()), { country, continent: entry.continent });
  }
}

const continentTokenIndex = new Map<string, Continent>();
for (const [continent, tokens] of Object.entries(CONTINENT_TOKENS)) {
  for (const token of tokens) continentTokenIndex.set(normalize(token.trim()), continent as Continent);
}

const countryByContinent = new Map<string, Continent>();
for (const entry of Object.values(CITIES_BY_COUNTRY)) {
  const country = Object.entries(CITIES_BY_COUNTRY).find(([, e]) => e === entry)?.[0];
  if (country) countryByContinent.set(country, entry.continent);
}
for (const [country, entry] of Object.entries(COUNTRY_ALIASES)) {
  countryByContinent.set(country, entry.continent);
}

interface PlacesResult {
  countries: Set<string>;
  continents: Set<Continent>;
  found: boolean;
}

function extractPlaces(raw: string): PlacesResult {
  const hay = normalize(raw);
  const countries = new Set<string>();
  const continents = new Set<Continent>();
  for (const [key, place] of cityIndex) {
    if (boundaryHit(hay, key)) {
      countries.add(place.country);
      continents.add(place.continent);
    }
  }
  for (const [alias, place] of countryAliasIndex) {
    if (boundaryHit(hay, alias)) {
      countries.add(place.country);
      continents.add(place.continent);
    }
  }
  for (const [token, continent] of continentTokenIndex) {
    if (boundaryHit(hay, token)) continents.add(continent);
  }
  return { countries, continents, found: countries.size > 0 || continents.size > 0 };
}

/** The set of known countries this location string mentions. */
export function countriesOf(location: string | null | undefined): Set<string> {
  return extractPlaces(location ?? '').countries;
}

/** The set of continents this location string mentions. */
export function continentsOf(location: string | null | undefined): Set<Continent> {
  return extractPlaces(location ?? '').continents;
}

/**
 * Whether a job location matches a region selection. `region` is a continent
 * name ("Europe") or a canonical country name ("Netherlands"). Returns true for
 * an empty/blank selection (no filter). Falls back to a plain substring match
 * when the taxonomy couldn't recognize anything in the location.
 */
export function matchesLocation(
  location: string | null | undefined,
  region: string,
): boolean {
  const selection = region.trim();
  if (!selection) return true;

  const raw = location ?? '';
  const { countries, continents } = extractPlaces(raw);
  const targetKey = normalize(selection);

  if (countries.size > 0 || continents.size > 0) {
    for (const country of countries) {
      if (normalize(country) === targetKey) return true;
    }
    for (const continent of continents) {
      if (normalize(continent) === targetKey) return true;
    }
    return false;
  }

  // Nothing recognized -> fall back to a naive substring match so we never drop rows.
  return normalize(raw).includes(targetKey);
}

/**
 * Build the grouped location options (continents with their countries) for the
 * filter dropdown from a set of jobs, based on what's actually present in the data.
 */
export function getLocationFilterOptions(
  jobs: ReadonlyArray<{ location?: string | null } | null | undefined>,
): LocationGroupOptions[] {
  const presentCountries = new Set<string>();
  const presentContinents = new Set<Continent>();
  for (const job of jobs) {
    if (!job || !job.location) continue;
    const { countries, continents } = extractPlaces(job.location);
    countries.forEach((c) => presentCountries.add(c));
    continents.forEach((c) => presentContinents.add(c));
  }

  const groups: LocationGroupOptions[] = [];
  for (const continent of CONTINENTS) {
    const countries = Array.from(presentCountries)
      .filter((c) => countryByContinent.get(c) === continent)
      .sort();
    if (countries.length > 0 || presentContinents.has(continent)) {
      groups.push({ continent, countries });
    }
  }
  return groups;
}