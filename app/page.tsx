'use client'

import dynamic from 'next/dynamic'

// Chart uses browser APIs — no SSR
const Dashboard = dynamic(() => import('@/components/Dashboard'), { ssr: false })

export default function Page() {
  return <Dashboard />
}
