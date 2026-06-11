import { createFileRoute } from '@tanstack/react-router'

import { TopologyCanvas } from '../components/TopologyCanvas'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <TopologyCanvas />
}
