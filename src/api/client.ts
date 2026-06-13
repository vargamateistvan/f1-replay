const BASE = 'https://api.openf1.org/v1'

// Simple rate-limit queue: max 3 requests per second
const queue: Array<() => void> = []
let inFlight = 0
const MAX_CONCURRENT = 3

function drain() {
  while (inFlight < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()!
    inFlight++
    next()
  }
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          inFlight--
          drain()
        })
    })
    drain()
  })
}

export async function fetchEndpoint<T>(
  path: string,
  params: Record<string, string | number | boolean>,
): Promise<T[]> {
  return enqueue(async () => {
    const url = new URL(`${BASE}/${path}`)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.append(k, String(v))
    }
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`OpenF1 ${path}: ${res.status}`)
    return res.json() as Promise<T[]>
  })
}
