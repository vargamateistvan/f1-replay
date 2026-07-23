const NON_PERSISTED_QUERY_PREFIXES = new Set([
  "location-chunk",
  "allCarDataWindow",
  "carDataWindow",
]);

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return !(typeof root === "string" && NON_PERSISTED_QUERY_PREFIXES.has(root));
}
