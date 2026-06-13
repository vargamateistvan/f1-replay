import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRouter } from './routes'
import { useEffect } from 'react'
import { startClock, stopClock } from './timeline/clock'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { OpenF1Error } from '@/api/client'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry client errors (401/403/404) — only transient failures.
      retry: (count, error) => {
        if (error instanceof OpenF1Error && error.status >= 400 && error.status < 500) return false
        return count < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  useEffect(() => {
    startClock()
    return stopClock
  }, [])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
