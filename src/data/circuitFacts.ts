export interface CircuitFacts {
  lengthKm: string;
  raceDistanceKm: string;
  laps: string;
  lapRecord: string;
  turns: string;
  drsZones: string;
  firstGpYear: string;
  direction: "Clockwise" | "Counterclockwise";
  altitudeM: string;
}

export const CIRCUIT_FACTS_LAST_SYNC_UTC = "2026-06-17" as const;

const CIRCUIT_FACTS_ALIASES: Record<string, string> = {
  melbourne: "albert park grand prix circuit",
  "albert park": "albert park grand prix circuit",
  sakhir: "bahrain international circuit",
  bahrain: "bahrain international circuit",
  jeddah: "jeddah corniche circuit",
  australia: "albert park grand prix circuit",
  catalunya: "circuit de barcelona-catalunya",
  barcelona: "circuit de barcelona-catalunya",
  monaco: "circuit de monaco",
  montreal: "circuit gilles villeneuve",
  canada: "circuit gilles villeneuve",
  austria: "red bull ring",
  silverstone: "silverstone circuit",
  hungary: "hungaroring",
  "spa-francorchamps": "circuit de spa-francorchamps",
  "spa francorchamps": "circuit de spa-francorchamps",
  netherlands: "zandvoort",
  zandvoort: "zandvoort",
  monza: "autodromo nazionale monza",
  baku: "baku city circuit",
  singapore: "marina bay street circuit",
  austin: "circuit of the americas",
  "mexico city": "autodromo hermanos rodriguez",
  mexico: "autodromo hermanos rodriguez",
  "sao paulo": "interlagos",
  "são paulo": "interlagos",
  interlagos: "interlagos",
  "las vegas": "las vegas strip circuit",
  losail: "losail international circuit",
  qatar: "losail international circuit",
  "yas marina": "yas marina circuit",
  "abu dhabi": "yas marina circuit",
  imola: "imola",
  shanghai: "shanghai international circuit",
  suzuka: "suzuka",
  miami: "miami international autodrome",
};

const CIRCUIT_FACTS_BY_SHORT_NAME: Record<string, CircuitFacts> = {
  "albert park grand prix circuit": {
    lengthKm: "5.278",
    raceDistanceKm: "306.124",
    laps: "58",
    lapRecord: "1:19.813 (Charles Leclerc, 2024)",
    turns: "14",
    drsZones: "4",
    firstGpYear: "1996",
    direction: "Clockwise",
    altitudeM: "10",
  },
  "bahrain international circuit": {
    lengthKm: "5.412",
    raceDistanceKm: "308.238",
    laps: "57",
    lapRecord: "1:31.447 (Pedro de la Rosa, 2005)",
    turns: "15",
    drsZones: "3",
    firstGpYear: "2004",
    direction: "Clockwise",
    altitudeM: "7",
  },
  "baku city circuit": {
    lengthKm: "6.003",
    raceDistanceKm: "306.049",
    laps: "51",
    lapRecord: "1:43.009 (Charles Leclerc, 2019)",
    turns: "20",
    drsZones: "2",
    firstGpYear: "2016",
    direction: "Counterclockwise",
    altitudeM: "-28",
  },
  "circuit de barcelona-catalunya": {
    lengthKm: "4.657",
    raceDistanceKm: "307.236",
    laps: "66",
    lapRecord: "1:15.743 (Oscar Piastri, 2025)",
    turns: "14",
    drsZones: "2",
    firstGpYear: "1991",
    direction: "Clockwise",
    altitudeM: "109",
  },
  "circuit de monaco": {
    lengthKm: "3.337",
    raceDistanceKm: "260.286",
    laps: "78",
    lapRecord: "1:12.909 (Lewis Hamilton, 2021)",
    turns: "19",
    drsZones: "1",
    firstGpYear: "1950",
    direction: "Clockwise",
    altitudeM: "15",
  },
  "circuit de spa-francorchamps": {
    lengthKm: "7.004",
    raceDistanceKm: "308.052",
    laps: "44",
    lapRecord: "1:44.701 (Sergio Pérez, 2024)",
    turns: "19",
    drsZones: "2",
    firstGpYear: "1950",
    direction: "Clockwise",
    altitudeM: "420",
  },
  "circuit gilles villeneuve": {
    lengthKm: "4.361",
    raceDistanceKm: "305.270",
    laps: "70",
    lapRecord: "1:13.078 (Valtteri Bottas, 2019)",
    turns: "14",
    drsZones: "3",
    firstGpYear: "1978",
    direction: "Clockwise",
    altitudeM: "13",
  },
  "circuit of the americas": {
    lengthKm: "5.513",
    raceDistanceKm: "308.405",
    laps: "56",
    lapRecord: "1:36.169 (Charles Leclerc, 2019)",
    turns: "20",
    drsZones: "2",
    firstGpYear: "2012",
    direction: "Counterclockwise",
    altitudeM: "251",
  },
  hungaroring: {
    lengthKm: "4.381",
    raceDistanceKm: "306.630",
    laps: "70",
    lapRecord: "1:16.627 (Lewis Hamilton, 2020)",
    turns: "14",
    drsZones: "2",
    firstGpYear: "1986",
    direction: "Clockwise",
    altitudeM: "264",
  },
  interlagos: {
    lengthKm: "4.309",
    raceDistanceKm: "305.879",
    laps: "71",
    lapRecord: "1:10.540 (Bottas, 2018)",
    turns: "15",
    drsZones: "2",
    firstGpYear: "1973",
    direction: "Counterclockwise",
    altitudeM: "785",
  },
  "jeddah corniche circuit": {
    lengthKm: "6.174",
    raceDistanceKm: "308.450",
    laps: "50",
    lapRecord: "1:30.734 (Hamilton, 2021)",
    turns: "27",
    drsZones: "3",
    firstGpYear: "2021",
    direction: "Counterclockwise",
    altitudeM: "15",
  },
  "las vegas strip circuit": {
    lengthKm: "6.201",
    raceDistanceKm: "309.958",
    laps: "50",
    lapRecord: "1:34.876 (Norris, 2024)",
    turns: "17",
    drsZones: "2",
    firstGpYear: "2023",
    direction: "Counterclockwise",
    altitudeM: "620",
  },
  "losail international circuit": {
    lengthKm: "5.419",
    raceDistanceKm: "308.611",
    laps: "57",
    lapRecord: "1:22.384 (Lando Norris, 2024)",
    turns: "16",
    drsZones: "1",
    firstGpYear: "2021",
    direction: "Clockwise",
    altitudeM: "6",
  },
  "marina bay street circuit": {
    lengthKm: "4.927",
    raceDistanceKm: "306.143",
    laps: "62",
    lapRecord: "1:33.808 (Lewis Hamilton, 2025)",
    turns: "19",
    drsZones: "3",
    firstGpYear: "2008",
    direction: "Counterclockwise",
    altitudeM: "18",
  },
  "miami international autodrome": {
    lengthKm: "5.412",
    raceDistanceKm: "308.326",
    laps: "57",
    lapRecord: "1:29.708 (Max Verstappen, 2023)",
    turns: "19",
    drsZones: "3",
    firstGpYear: "2022",
    direction: "Counterclockwise",
    altitudeM: "3",
  },
  "red bull ring": {
    lengthKm: "4.326",
    raceDistanceKm: "306.452",
    laps: "71",
    lapRecord: "1:07.924 (Oscar Piastri, 2025)",
    turns: "10",
    drsZones: "3",
    firstGpYear: "1970",
    direction: "Clockwise",
    altitudeM: "677",
  },
  "silverstone circuit": {
    lengthKm: "5.891",
    raceDistanceKm: "306.198",
    laps: "52",
    lapRecord: "1:27.097 (Max Verstappen, 2020)",
    turns: "18",
    drsZones: "2",
    firstGpYear: "1950",
    direction: "Clockwise",
    altitudeM: "153",
  },
  suzuka: {
    lengthKm: "5.807",
    raceDistanceKm: "307.471",
    laps: "53",
    lapRecord: "1:30.965 (Andrea Kimi Antonelli, 2025)",
    turns: "18",
    drsZones: "1",
    firstGpYear: "1987",
    direction: "Clockwise",
    altitudeM: "45",
  },
  "yas marina circuit": {
    lengthKm: "5.281",
    raceDistanceKm: "306.183",
    laps: "58",
    lapRecord: "1:25.637 (Kevin Magnussen, 2024)",
    turns: "16",
    drsZones: "2",
    firstGpYear: "2009",
    direction: "Counterclockwise",
    altitudeM: "3",
  },
  zandvoort: {
    lengthKm: "4.259",
    raceDistanceKm: "306.587",
    laps: "72",
    lapRecord: "1:11.097 (Lewis Hamilton, 2021)",
    turns: "14",
    drsZones: "2",
    firstGpYear: "1952",
    direction: "Clockwise",
    altitudeM: "6",
  },
  "autodromo nazionale monza": {
    lengthKm: "5.793",
    raceDistanceKm: "306.720",
    laps: "53",
    lapRecord: "1:20.901 (Lando Norris, 2025)",
    turns: "11",
    drsZones: "2",
    firstGpYear: "1950",
    direction: "Clockwise",
    altitudeM: "162",
  },
  "autodromo hermanos rodriguez": {
    lengthKm: "4.304",
    raceDistanceKm: "305.354",
    laps: "71",
    lapRecord: "1:17.774 (Valtteri Bottas, 2021)",
    turns: "17",
    drsZones: "3",
    firstGpYear: "1963",
    direction: "Clockwise",
    altitudeM: "2240",
  },
  imola: {
    lengthKm: "4.909",
    raceDistanceKm: "309.049",
    laps: "63",
    lapRecord: "1:15.484 (Hamilton, 2020)",
    turns: "19",
    drsZones: "1",
    firstGpYear: "1980",
    direction: "Counterclockwise",
    altitudeM: "37",
  },
  "shanghai international circuit": {
    lengthKm: "5.451",
    raceDistanceKm: "305.066",
    laps: "56",
    lapRecord: "1:32.238 (Schumacher, 2004)",
    turns: "16",
    drsZones: "2",
    firstGpYear: "2004",
    direction: "Clockwise",
    altitudeM: "5",
  },
  monza: {
    lengthKm: "5.793",
    raceDistanceKm: "306.720",
    laps: "53",
    lapRecord: "1:20.901 (Lando Norris, 2025)",
    turns: "11",
    drsZones: "2",
    firstGpYear: "1950",
    direction: "Clockwise",
    altitudeM: "162",
  },
  spa: {
    lengthKm: "7.004",
    raceDistanceKm: "308.052",
    laps: "44",
    lapRecord: "1:44.701 (Sergio Pérez, 2024)",
    turns: "19",
    drsZones: "2",
    firstGpYear: "1950",
    direction: "Clockwise",
    altitudeM: "420",
  },
  "sao paulo": {
    lengthKm: "4.309",
    raceDistanceKm: "305.879",
    laps: "71",
    lapRecord: "1:10.540 (Bottas, 2018)",
    turns: "15",
    drsZones: "2",
    firstGpYear: "1973",
    direction: "Counterclockwise",
    altitudeM: "785",
  },
};

function normalizeCircuitName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ");
}

export function getCircuitFacts(circuitShortName: string | null | undefined) {
  if (!circuitShortName) return null;

  const normalized = normalizeCircuitName(circuitShortName);
  const direct = CIRCUIT_FACTS_BY_SHORT_NAME[normalized];
  if (direct) return direct;

  const aliasKey = CIRCUIT_FACTS_ALIASES[normalized];
  if (aliasKey) {
    const aliased = CIRCUIT_FACTS_BY_SHORT_NAME[aliasKey];
    if (aliased) return aliased;
  }

  // Fallback: short names like "Catalunya" should match
  // canonical keys such as "circuit de barcelona-catalunya".
  for (const [key, facts] of Object.entries(CIRCUIT_FACTS_BY_SHORT_NAME)) {
    if (key.includes(normalized) || normalized.includes(key)) return facts;
  }

  return null;
}
