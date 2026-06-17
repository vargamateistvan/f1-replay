export interface CircuitFacts {
  lengthKm?: string;
  raceDistanceKm?: string;
  laps?: string;
  lapRecord?: string;
  turns?: string;
  drsZones?: string;
  firstGpYear?: string;
  direction?: "Clockwise" | "Counterclockwise";
  altitudeM?: string;
}

const PAGE_OVERRIDES: Record<string, string> = {
  "monte carlo": "Circuit de Monaco",
  monaco: "Circuit de Monaco",
  catalunya: "Circuit de Barcelona-Catalunya",
  barcelona: "Circuit de Barcelona-Catalunya",
  monza: "Monza Circuit",
  spa: "Circuit de Spa-Francorchamps",
  interlagos: "Interlagos",
};

function cleanWikiValue(raw: string) {
  return raw
    .replace(/<ref[^/>]*\/\s*>/gi, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/{{\s*convert\s*\|\s*([^|}]+)(?:\|([^|}]+))?/gi, "$1")
    .replace(/{{[^{}]*}}/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractField(wikitext: string, field: string) {
  const regex = new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n]+)`, "i");
  const value = wikitext.match(regex)?.[1] ?? "";
  return cleanWikiValue(value);
}

function firstNumber(value: string) {
  return value.match(/-?\d+(?:\.\d+)?/)?.[0] ?? null;
}

function extractLapRecord(wikitext: string) {
  const timeRaw = extractField(wikitext, "record_time");
  const driverRaw = extractField(wikitext, "record_driver");
  const yearRaw = extractField(wikitext, "record_year");

  const time = timeRaw.match(/\d:\d{2}\.\d{3}/)?.[0] ?? null;
  const driver = driverRaw
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const year = yearRaw.match(/\d{4}/)?.[0] ?? null;

  if (!time || !driver || !year) return null;
  return `${time} (${driver}, ${year})`;
}

async function resolveWikiPage(shortName: string, countryName: string) {
  const attempts = [
    `${shortName} circuit ${countryName}`,
    `${shortName} Formula One circuit`,
    `${shortName} circuit`,
  ];

  for (const query of attempts) {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&origin=*&search=${encodeURIComponent(query)}`,
    );
    if (!res.ok) continue;
    const json = (await res.json()) as [string, string[]];
    const page = json?.[1]?.[0];
    if (page) return page;
  }

  return null;
}

export async function fetchCircuitFactsFromApi(
  circuitShortName: string,
  countryName: string,
): Promise<CircuitFacts | null> {
  const override = PAGE_OVERRIDES[circuitShortName.trim().toLowerCase()];
  const page =
    override ?? (await resolveWikiPage(circuitShortName, countryName));
  if (!page) return null;

  const parseRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&origin=*&page=${encodeURIComponent(page)}`,
  );
  if (!parseRes.ok) return null;
  const parsed = await parseRes.json();
  const wikitext = parsed?.parse?.wikitext?.["*"] as string | undefined;
  if (!wikitext) return null;

  const lengthKm = firstNumber(extractField(wikitext, "length_km"));
  const raceDistanceKm = firstNumber(extractField(wikitext, "race_length_km"));
  const laps = firstNumber(extractField(wikitext, "race_laps"));
  const turns = firstNumber(extractField(wikitext, "turns"));
  const firstGpYear =
    extractField(wikitext, "first_held").match(/\d{4}/)?.[0] ?? null;
  const lapRecord = extractLapRecord(wikitext);

  const facts: CircuitFacts = {};
  if (lengthKm) facts.lengthKm = lengthKm;
  if (raceDistanceKm) facts.raceDistanceKm = raceDistanceKm;
  if (laps) facts.laps = laps;
  if (turns) facts.turns = turns;
  if (firstGpYear) facts.firstGpYear = firstGpYear;
  if (lapRecord) facts.lapRecord = lapRecord;

  return Object.keys(facts).length ? facts : null;
}
