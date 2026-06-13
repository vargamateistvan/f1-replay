import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRouter } from './routes'
import { useEffect } from 'react'
import { startClock, stopClock } from './timeline/clock'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
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
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  )
}
