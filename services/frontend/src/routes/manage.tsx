import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'

import { createApp, deleteApp, getSession, listApps, uploadEnvFile } from '../platform/api'
import type { PlatformApp } from '../topology/topology'

export const Route = createFileRoute('/manage')({
  component: ManagePage,
})

function ManagePage() {
  const navigate = useNavigate()
  const [apps, setApps] = useState<PlatformApp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    image: '',
    port: '3000',
    replicas: '2',
    domains: '',
  })
  const [saving, setSaving] = useState(false)
  const [busyApp, setBusyApp] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function refreshApps() {
    const nextApps = await listApps()
    setApps(nextApps)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const session = await getSession()
        if (!session.authenticated) {
          await navigate({ to: '/login' })
          return
        }
        const nextApps = await listApps()
        if (!cancelled) {
          setApps(nextApps)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load services')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [navigate])

  function updateForm(event: ChangeEvent<HTMLInputElement>) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function handleCreateApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const domains = form.domains
        .split(',')
        .map((domain) => domain.trim())
        .filter(Boolean)

      const port = Number(form.port)
      const replicas = Number(form.replicas)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        setError('Port must be a whole number between 1 and 65535')
        return
      }
      if (!Number.isInteger(replicas) || replicas < 1 || replicas > 20) {
        setError('Replicas must be a whole number between 1 and 20')
        return
      }

      const app = await createApp({
        name: form.name.trim(),
        image: form.image.trim(),
        port,
        replicas,
        domains,
      })

      setForm({
        name: '',
        image: '',
        port: '3000',
        replicas: '2',
        domains: '',
      })
      setNotice(`${app.name} created`)
      await refreshApps()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create app')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteApp(app: PlatformApp) {
    if (!window.confirm(`Delete ${app.name}?`)) {
      return
    }

    setBusyApp(app.name)
    setError(null)
    setNotice(null)
    try {
      await deleteApp(app.name)
      setNotice(`${app.name} deleted`)
      await refreshApps()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete app')
    } finally {
      setBusyApp(null)
    }
  }

  async function handleEnvFile(app: PlatformApp, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    setBusyApp(app.name)
    setError(null)
    setNotice(null)
    try {
      const result = await uploadEnvFile(app.name, await file.text())
      setNotice(`${app.name} env updated: ${result.env.length} secrets stored`)
      await refreshApps()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload env file')
    } finally {
      setBusyApp(null)
    }
  }

  return (
    <main className="manage-shell">
      <header className="manage-header">
        <div>
          <p>platform control</p>
          <h1>Services</h1>
        </div>
        <Link className="text-link" to="/">
          Service graph
        </Link>
      </header>

      <section className="operator-panel" aria-label="Create platform app">
        <form className="create-app-form" onSubmit={handleCreateApp}>
          <label>
            <span>Name</span>
            <input name="name" pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?" required value={form.name} onChange={updateForm} />
          </label>
          <label>
            <span>Image</span>
            <input name="image" required value={form.image} onChange={updateForm} placeholder="ghcr.io/org/app:tag" />
          </label>
          <label>
            <span>Port</span>
            <input min="1" max="65535" name="port" required type="number" value={form.port} onChange={updateForm} />
          </label>
          <label>
            <span>Replicas</span>
            <input min="1" max="20" name="replicas" required type="number" value={form.replicas} onChange={updateForm} />
          </label>
          <label className="create-app-form__wide">
            <span>Domains</span>
            <input name="domains" value={form.domains} onChange={updateForm} placeholder="app.local.edinstance.uk, app.edinstance.uk" />
          </label>
          <button disabled={saving} type="submit">
            {saving ? 'Creating...' : 'Create app'}
          </button>
        </form>
        {notice ? <p className="table-state table-state--notice">{notice}</p> : null}
      </section>

      <section className="service-table" aria-label="Managed platform services">
        <div className="service-row service-row--head">
          <span>Name</span>
          <span>Status</span>
          <span>Image</span>
          <span>Domains</span>
          <span>Actions</span>
        </div>
        {loading ? <p className="table-state">Loading services...</p> : null}
        {error ? <p className="table-state table-state--error">{error}</p> : null}
        {!loading && !error && apps.length === 0 ? <p className="table-state">No platform services yet.</p> : null}
        {apps.map((app) => (
          <article className="service-row" key={app.name}>
            <strong>{app.name}</strong>
            <span className="status-stack">
              <span className={`status-pill ${app.ready ? 'status-pill--ready' : 'status-pill--pending'}`}>{app.status}</span>
              <small>
                {app.ready ? 'ready' : 'not ready'} / {app.replicas} replicas
              </small>
              {app.updatedAt ? <small>{app.updatedAt}</small> : null}
            </span>
            <code>{app.image}</code>
            <span>{app.domains.map((domain) => domain.host).join(', ') || 'none'}</span>
            <span className="row-actions">
              <label className="file-action">
                <input accept=".env,text/plain" type="file" onChange={(event) => void handleEnvFile(app, event)} />
                <span>{busyApp === app.name ? 'Working...' : 'Upload env'}</span>
              </label>
              <button disabled={busyApp === app.name} type="button" onClick={() => void handleDeleteApp(app)}>
                Delete
              </button>
            </span>
          </article>
        ))}
      </section>
    </main>
  )
}
