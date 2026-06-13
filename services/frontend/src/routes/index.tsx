import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { TopologyCanvas } from '../components/TopologyCanvas'
import { getSession, listApps } from '../platform/api'
import type { PlatformApp } from '../topology/topology'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [apps, setApps] = useState<PlatformApp[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const session = await getSession()
      if (!session.authenticated) return
      try {
        const nextApps = await listApps()
        if (!cancelled) setApps(nextApps)
      } catch {
        // The graph still shows platform infrastructure when the control API is unavailable.
      }
    })()
    return () => { cancelled = true }
  }, [])

  return <TopologyCanvas apps={apps} />
}
