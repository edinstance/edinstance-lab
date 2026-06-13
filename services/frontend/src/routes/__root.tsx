import type { ReactNode } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        name: 'description',
        content: 'Interactive edinstance Kubernetes topology built with TanStack Start and React Flow.',
      },
      { title: 'edinstance platform' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-[#f4f1e8] bg-[linear-gradient(90deg,rgba(23,33,27,.04)_1px,transparent_1px),linear-gradient(rgba(23,33,27,.04)_1px,transparent_1px)] bg-[size:28px_28px] font-serif text-[#17211b]">
        {children}
        <Scripts />
      </body>
    </html>
  )
}
