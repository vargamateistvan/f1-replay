import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { AppRouter } from './routes'
import { useEffect } from 'react'
import { startClock, stopClock } from './timeline/clock'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OpenF1Error } from '@/api/client'
import { queryPersister } from '@/lib/queryPersister'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry client errors (401/403/404) — only transient failures.
      retry: (count, error) => {
        if (error instanceof OpenF1Error && error.status >= 400 && error.status < 500) return false
        return count < 2
      },
      refetchOnWindowFocus: false,
      // Keep everything in memory for the whole session; persister's maxAge handles expiry.
      gcTime: Infinity,
    },
  },
})

// Historical F1 data never changes, so 30 days is a safe persistence window.
// Live-session queries (staleTime: 0) are restored as stale and immediately refetched.
const PERSIST_MAX_AGE = 30 * 24 * 60 * 60 * 1000

export default function App() {
  useEffect(() => {
    startClock()
    return stopClock
  }, [])

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE }}
      >
        <AppRouter />
      </PersistQueryClientProvider>
    </ErrorBoundary>
  )
}
