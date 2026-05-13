'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { getQueryClient } from '@/lib/react-query/query-client'

export function Providers({ children }) {
  const [queryClient] = useState(() => getQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
