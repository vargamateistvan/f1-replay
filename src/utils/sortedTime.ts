export function upperBoundByValue<T>(
  arr: readonly T[],
  cutoff: number,
  getValue: (item: T) => number,
): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (getValue(arr[mid]!) <= cutoff) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function lastAtOrBefore<T>(
  arr: readonly T[],
  cutoff: number,
  getValue: (item: T) => number,
): T | undefined {
  const idx = upperBoundByValue(arr, cutoff, getValue) - 1;
  return idx >= 0 ? arr[idx] : undefined;
}

export function windowBoundsByValue<T>(
  arr: readonly T[],
  start: number,
  end: number,
  getValue: (item: T) => number,
) {
  return {
    startIndex: upperBoundByValue(arr, start, getValue),
    endIndex: upperBoundByValue(arr, end, getValue),
  };
}
