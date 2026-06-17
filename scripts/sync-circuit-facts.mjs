import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const FACTS_PATH = resolve(process.cwd(), "src/data/circuitFacts.ts");

const WIKI_PAGE_BY_CIRCUIT_KEY = {
  "albert park grand prix circuit": "Albert_Park_Circuit",
  "autodromo hermanos rodriguez": "Aut%C3%B3dromo_Hermanos_Rodr%C3%ADguez",
  "autodromo nazionale monza": "Monza_Circuit",
  "bahrain international circuit": "Bahrain_International_Circuit",
  "baku city circuit": "Baku_City_Circuit",
  "circuit de barcelona-catalunya": "Circuit_de_Barcelona-Catalunya",
  "circuit de monaco": "Circuit_de_Monaco",
  "circuit de spa-francorchamps": "Circuit_de_Spa-Francorchamps",
  "circuit gilles villeneuve": "Circuit_Gilles_Villeneuve",
  "circuit of the americas": "Circuit_of_the_Americas",
  hungaroring: "Hungaroring",
  imola: "Imola_Circuit",
  interlagos: "Interlagos",
  "jeddah corniche circuit": "Jeddah_Corniche_Circuit",
  "las vegas strip circuit": "Las_Vegas_Grand_Prix",
  "losail international circuit": "Losail_International_Circuit",
  "marina bay street circuit": "Marina_Bay_Street_Circuit",
  "miami international autodrome": "Miami_International_Autodrome",
  monza: "Monza_Circuit",
  "red bull ring": "Red_Bull_Ring",
  "sao paulo": "Interlagos",
  "shanghai international circuit": "Shanghai_International_Circuit",
  "silverstone circuit": "Silverstone_Circuit",
  spa: "Circuit_de_Spa-Francorchamps",
  suzuka: "Suzuka_Circuit",
  "yas marina circuit": "Yas_Marina_Circuit",
  zandvoort: "Circuit_Zandvoort",
};

function parseFactsObject(sourceText) {
  const match = sourceText.match(
    /const CIRCUIT_FACTS_BY_SHORT_NAME:[\s\S]*?=\s*({[\s\S]*?})\s*\n\s*function normalizeCircuitName/m,
  );
  if (!match?.[1]) {
    throw new Error("Could not locate CIRCUIT_FACTS_BY_SHORT_NAME object");
  }

  // The object literal is valid JS and safe to evaluate from local source.
  return Function(`"use strict"; return (${match[1]});`)();
}

function cleanWikiValue(raw) {
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

function extractField(wikitext, field) {
  const regex = new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n]+)`, "i");
  const value = wikitext.match(regex)?.[1] ?? "";
  return cleanWikiValue(value);
}

function firstNumber(value) {
  return value.match(/-?\d+(?:\.\d+)?/)?.[0] ?? null;
}

function extractLapRecord(wikitext) {
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

function toFactsFileText(dataByCircuitKey) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push("export interface CircuitFacts {");
  lines.push("  lengthKm: string");
  lines.push("  raceDistanceKm: string");
  lines.push("  laps: string");
  lines.push("  lapRecord: string");
  lines.push("  turns: string");
  lines.push("  drsZones: string");
  lines.push("  firstGpYear: string");
  lines.push('  direction: "Clockwise" | "Counterclockwise"');
  lines.push("  altitudeM: string");
  lines.push("}");
  lines.push("");
  lines.push(
    `export const CIRCUIT_FACTS_LAST_SYNC_UTC = "${timestamp}" as const`,
  );
  lines.push("");
  lines.push(
    "const CIRCUIT_FACTS_BY_SHORT_NAME: Record<string, CircuitFacts> = {",
  );

  for (const [key, facts] of Object.entries(dataByCircuitKey)) {
    const printableKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)
      ? key
      : JSON.stringify(key);
    lines.push(`  ${printableKey}: {`);
    lines.push(`    lengthKm: ${JSON.stringify(facts.lengthKm)},`);
    lines.push(`    raceDistanceKm: ${JSON.stringify(facts.raceDistanceKm)},`);
    lines.push(`    laps: ${JSON.stringify(facts.laps)},`);
    lines.push(`    lapRecord: ${JSON.stringify(facts.lapRecord)},`);
    lines.push(`    turns: ${JSON.stringify(facts.turns)},`);
    lines.push(`    drsZones: ${JSON.stringify(facts.drsZones)},`);
    lines.push(`    firstGpYear: ${JSON.stringify(facts.firstGpYear)},`);
    lines.push(`    direction: ${JSON.stringify(facts.direction)},`);
    lines.push(`    altitudeM: ${JSON.stringify(facts.altitudeM)},`);
    lines.push("  },");
  }

  lines.push("}");
  lines.push("");
  lines.push("function normalizeCircuitName(name: string) {");
  lines.push("  return name");
  lines.push('    .normalize("NFD")');
  lines.push('    .replace(/[\\u0300-\\u036f]/g, "")');
  lines.push("    .trim()");
  lines.push("    .toLowerCase()");
  lines.push('    .replace(/[.,\'’]/g, "")');
  lines.push('    .replace(/\\s+/g, " ")');
  lines.push("}");
  lines.push("");
  lines.push(
    "export function getCircuitFacts(circuitShortName: string | null | undefined) {",
  );
  lines.push("  if (!circuitShortName) return null");
  lines.push(
    "  return CIRCUIT_FACTS_BY_SHORT_NAME[normalizeCircuitName(circuitShortName)] ?? null",
  );
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

async function fetchWikiWikitext(page) {
  const url =
    "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=" +
    page +
    "&origin=*";

  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "f1-replay-circuit-sync/1.0",
      },
    });

    if (response.status === 429 || response.status >= 500) {
      const delayMs = Math.min(1500 * (attempt + 1), 6000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    return json?.parse?.wikitext?.["*"] ?? "";
  }

  throw new Error("HTTP 429/5xx after retries");
}

async function main() {
  const sourceText = readFileSync(FACTS_PATH, "utf8");
  const facts = parseFactsObject(sourceText);

  let updated = 0;
  let skipped = 0;

  for (const [circuitKey, circuitFacts] of Object.entries(facts)) {
    const page = WIKI_PAGE_BY_CIRCUIT_KEY[circuitKey];
    if (!page) {
      skipped++;
      continue;
    }

    try {
      const wikitext = await fetchWikiWikitext(page);
      const lengthKm = firstNumber(extractField(wikitext, "length_km"));
      const turns = firstNumber(extractField(wikitext, "turns"));
      const lapRecord = extractLapRecord(wikitext);

      if (lengthKm) circuitFacts.lengthKm = lengthKm;
      if (turns) circuitFacts.turns = turns;
      if (lapRecord) circuitFacts.lapRecord = lapRecord;

      updated++;
      process.stdout.write(`Updated ${circuitKey}\n`);

      // Be polite to upstream APIs to reduce rate limiting.
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (error) {
      skipped++;
      process.stdout.write(
        `Skipped ${circuitKey} (${error instanceof Error ? error.message : "unknown error"})\n`,
      );
    }
  }

  writeFileSync(FACTS_PATH, toFactsFileText(facts));
  process.stdout.write(
    `\nDone. Updated ${updated} circuits, skipped ${skipped}.\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
