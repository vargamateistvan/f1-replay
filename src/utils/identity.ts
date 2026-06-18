const GENERIC_TEAM_TOKENS = new Set([
  "f1",
  "formula",
  "one",
  "team",
  "racing",
  "grand",
  "prix",
  "sport",
  "motorsport",
  "motorsports",
  "amg",
  "app",
  "cash",
]);

const TEAM_ALIAS_GROUPS = [
  [
    "racing bulls",
    "rb",
    "visa cash app rb",
    "visa cash app racing bulls",
    "alphatauri",
    "toro rosso",
  ],
  [
    "sauber",
    "stake sauber",
    "stake f1 team kick sauber",
    "alfa romeo",
    "alfa romeo racing",
  ],
] as const;

const CIRCUIT_SUFFIXES = [
  /\bcircuit\b/gi,
  /\binternational circuit\b/gi,
  /\binternational autodrome\b/gi,
  /\bautodrome\b/gi,
  /\bautodromo\b/gi,
  /\braceway\b/gi,
  /\bspeedway\b/gi,
  /\bstreet circuit\b/gi,
] as const;

function slugifyName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

function tokenNgrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = start + 2; end <= tokens.length; end += 1) {
      out.push(tokens.slice(start, end).join("-"));
    }
  }
  return out;
}

function teamAliasKeys(name: string): string[] {
  const slug = slugifyName(name);
  const group = TEAM_ALIAS_GROUPS.find((aliases) =>
    aliases.some((alias) => slugifyName(alias) === slug),
  );
  return group ? group.map((alias) => slugifyName(alias)) : [];
}

export function teamIdentityKeys(name: string): string[] {
  const slug = slugifyName(name);
  const rawTokens = slug.split("-").filter(Boolean);
  const tokens = rawTokens.filter((token) => !GENERIC_TEAM_TOKENS.has(token));
  const acronym = tokens.map((token) => token[0]).join("");

  return unique(
    [
      slug,
      ...teamAliasKeys(name),
      ...rawTokens,
      ...tokens,
      ...tokenNgrams(tokens),
      tokens.join("-"),
      acronym,
    ].filter(Boolean),
  );
}

export function canonicalTeamName(
  name: string,
  candidates: Iterable<string>,
): string {
  const candidateList = unique([...candidates].filter(Boolean));
  if (candidateList.length === 0) return name;

  const requestedKeys = new Set(teamIdentityKeys(name));
  for (const candidate of candidateList) {
    if (candidate === name) return candidate;
  }

  let bestMatch = name;
  let bestScore = 0;

  for (const candidate of candidateList) {
    const candidateKeys = teamIdentityKeys(candidate);
    const overlap = candidateKeys.filter((key) => requestedKeys.has(key));
    if (overlap.length === 0) continue;

    const score = overlap.reduce(
      (total, key) => total + Math.max(key.length, 3),
      0,
    );
    if (score > bestScore) {
      bestMatch = candidate;
      bestScore = score;
    }
  }

  return bestMatch;
}

function stripCircuitSuffixes(name: string): string {
  return CIRCUIT_SUFFIXES.reduce(
    (value, pattern) => value.replace(pattern, " "),
    name,
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function circuitIdentityKeys(name: string): string[] {
  const stripped = stripCircuitSuffixes(name);
  const rawTokens = slugifyName(stripped).split("-").filter(Boolean);

  return unique(
    [
      slugifyName(name),
      slugifyName(stripped),
      ...rawTokens,
      ...tokenNgrams(rawTokens),
    ].filter(Boolean),
  );
}

export function buildCircuitSearchCandidates(
  circuitShortName: string,
  countryName: string,
): string[] {
  const short = circuitShortName.trim().replace(/\s+/g, " ");
  const base = stripCircuitSuffixes(short);
  const country = countryName.trim().replace(/\s+/g, " ");

  return unique(
    [
      short,
      `${short} Formula One circuit`,
      `${short} Grand Prix circuit`,
      base,
      `${base} Circuit`,
      `${base} Formula One circuit`,
      `${base} Grand Prix circuit`,
      `${base} circuit ${country}`,
      `${country} Grand Prix circuit`,
      `${country} Formula One circuit`,
    ].filter((candidate) => candidate.trim().length > 0),
  );
}
