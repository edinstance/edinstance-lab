import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react'

import { createApp, createDatabase, deleteApp, getSession, listApps, listDatabases, uploadEnvFile, type PostgresDatabase } from '../platform/api'
import type { PlatformApp } from '../topology/topology'

const fieldClass = 'grid gap-2 [&>span]:font-mono [&>span]:text-[.72rem] [&>span]:font-black [&>span]:uppercase [&>span]:leading-none [&>input]:min-h-[42px] [&>input]:border [&>input]:border-[#9c927f] [&>input]:bg-[#fffdf7] [&>input]:px-3 [&>input]:font-mono [&>input]:text-base [&>input]:font-black [&>input]:text-[#17211b]'
const buttonClass = 'min-h-[30px] border border-[#9c927f] bg-[#fffdf7e0] px-2.5 font-mono text-[.72rem] font-extrabold leading-none text-[#17211b] transition-colors hover:border-[#17211b] hover:bg-[#17211b] hover:text-[#fffdf7] disabled:cursor-not-allowed disabled:opacity-55'
const rowClass = 'grid min-h-14 grid-cols-[150px_150px_minmax(220px,1fr)_minmax(190px,1fr)_190px] gap-3.5 px-4 py-3.5 max-[860px]:grid-cols-1'

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
  const [databases, setDatabases] = useState<PostgresDatabase[]>([])
  const [databaseForm, setDatabaseForm] = useState({
    name: '', database: 'app', owner: 'app', password: '', version: '17', instances: '3',
    storageSize: '20Gi', poolerEnabled: true, poolerInstances: '2', poolMode: 'session' as 'session' | 'transaction',
  })

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
        const [nextApps, nextDatabases] = await Promise.all([listApps(), listDatabases()])
        if (!cancelled) {
          setApps(nextApps)
          setDatabases(nextDatabases)
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

  async function handleCreateDatabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const database = await createDatabase({
        name: databaseForm.name.trim(), database: databaseForm.database.trim(), owner: databaseForm.owner.trim(),
        password: databaseForm.password, version: databaseForm.version,
        instances: Number(databaseForm.instances), storageSize: databaseForm.storageSize.trim(),
        poolerEnabled: databaseForm.poolerEnabled, poolerInstances: Number(databaseForm.poolerInstances),
        poolMode: databaseForm.poolMode,
      })
      setDatabases((current) => [...current, database])
      setDatabaseForm((current) => ({ ...current, name: '', password: '' }))
      setNotice(`${database.name} PostgreSQL cluster requested`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create database')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const name = form.name.trim()
      const image = form.image.trim()
      if (name === '' || image === '') {
        setError('Name and image are required')
        return
      }
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
        name,
        image,
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
    if (file.size > 1024 * 1024) {
      setError('Env file too large; must be <= 1 MiB')
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
    <main className="min-h-screen p-7">
      <header className="mx-auto mb-6 flex max-w-[1180px] items-end justify-between max-[860px]:grid max-[860px]:items-start max-[860px]:gap-4">
        <div>
          <p className="mb-2 mt-0 font-mono text-[.68rem] font-black uppercase leading-none text-[#66736b]">platform control</p>
          <h1 className="m-0 text-[1.8rem] leading-none">Services</h1>
        </div>
        <Link className={`${buttonClass} inline-flex items-center py-2.5 uppercase no-underline`} to="/">
          Service graph
        </Link>
      </header>

      <section className="mx-auto mb-[18px] max-w-[1180px] border border-[#c9c1af] bg-[#fffdf7e6]" aria-label="Create platform app">
        <form className="grid grid-cols-[1fr_minmax(260px,2fr)_120px_120px] gap-3.5 p-4 max-[860px]:grid-cols-1" onSubmit={handleCreateApp}>
          <label className={fieldClass}>
            <span>Name</span>
            <input name="name" pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?" required value={form.name} onChange={updateForm} />
          </label>
          <label className={fieldClass}>
            <span>Image</span>
            <input name="image" required value={form.image} onChange={updateForm} placeholder="ghcr.io/org/app:tag" />
          </label>
          <label className={fieldClass}>
            <span>Port</span>
            <input min="1" max="65535" name="port" required type="number" value={form.port} onChange={updateForm} />
          </label>
          <label className={fieldClass}>
            <span>Replicas</span>
            <input min="1" max="20" name="replicas" required type="number" value={form.replicas} onChange={updateForm} />
          </label>
          <label className={`${fieldClass} col-[1/-2] max-[860px]:col-auto`}>
            <span>Domains</span>
            <input name="domains" value={form.domains} onChange={updateForm} placeholder="app.local.edinstance.uk, app.edinstance.uk" />
          </label>
          <button className={`${buttonClass} min-h-[42px] self-end`} disabled={saving} type="submit">
            {saving ? 'Creating...' : 'Create app'}
          </button>
        </form>
        {notice ? <p className="m-0 border-t border-[#c9c1afbf] px-4 py-[18px] font-mono text-[.82rem] font-extrabold leading-[1.4] text-[#517a38]">{notice}</p> : null}
      </section>

      <section className="mx-auto mb-[18px] max-w-[1180px] border border-[#c9c1af] bg-[#fffdf7e6]" aria-label="Create PostgreSQL database">
        <div className="border-b border-[#c9c1af] px-4 py-3">
          <p className="m-0 font-mono text-[.68rem] font-black uppercase text-[#66736b]">CloudNativePG</p>
          <h2 className="m-0 text-2xl">PostgreSQL cluster</h2>
        </div>
        <form className="grid grid-cols-4 gap-3.5 p-4 max-[860px]:grid-cols-1" onSubmit={handleCreateDatabase}>
          <label className={fieldClass}><span>Name / DNS prefix</span><input required pattern="[a-z0-9]([-a-z0-9]*[a-z0-9])?" value={databaseForm.name} onChange={(e) => setDatabaseForm({ ...databaseForm, name: e.target.value })} /></label>
          <label className={fieldClass}><span>Database</span><input required value={databaseForm.database} onChange={(e) => setDatabaseForm({ ...databaseForm, database: e.target.value })} /></label>
          <label className={fieldClass}><span>Owner</span><input required value={databaseForm.owner} onChange={(e) => setDatabaseForm({ ...databaseForm, owner: e.target.value })} /></label>
          <label className={fieldClass}><span>Password</span><input required minLength={12} type="password" value={databaseForm.password} onChange={(e) => setDatabaseForm({ ...databaseForm, password: e.target.value })} /></label>
          <label className={fieldClass}><span>PostgreSQL version</span><select className="min-h-[42px] border border-[#9c927f] bg-[#fffdf7] px-3 font-mono font-black" value={databaseForm.version} onChange={(e) => setDatabaseForm({ ...databaseForm, version: e.target.value })}><option>17</option><option>16</option></select></label>
          <label className={fieldClass}><span>Instances</span><input min="1" max="5" type="number" value={databaseForm.instances} onChange={(e) => setDatabaseForm({ ...databaseForm, instances: e.target.value })} /></label>
          <label className={fieldClass}><span>Storage</span><input value={databaseForm.storageSize} onChange={(e) => setDatabaseForm({ ...databaseForm, storageSize: e.target.value })} /></label>
          <label className={fieldClass}><span>Pool mode</span><select className="min-h-[42px] border border-[#9c927f] bg-[#fffdf7] px-3 font-mono font-black" disabled={!databaseForm.poolerEnabled} value={databaseForm.poolMode} onChange={(e) => setDatabaseForm({ ...databaseForm, poolMode: e.target.value as 'session' | 'transaction' })}><option value="session">session</option><option value="transaction">transaction</option></select></label>
          <label className="flex items-center gap-2 font-mono text-sm font-black"><input type="checkbox" checked={databaseForm.poolerEnabled} onChange={(e) => setDatabaseForm({ ...databaseForm, poolerEnabled: e.target.checked })} /> Enable PgBouncer</label>
          <label className={fieldClass}><span>Pooler replicas</span><input min="1" max="5" type="number" disabled={!databaseForm.poolerEnabled} value={databaseForm.poolerInstances} onChange={(e) => setDatabaseForm({ ...databaseForm, poolerInstances: e.target.value })} /></label>
          <button className={`${buttonClass} min-h-[42px] self-end`} disabled={saving} type="submit">Create database</button>
        </form>
        {databases.length > 0 ? <div className="border-t border-[#c9c1af] p-4">{databases.map((database) => <article className="mb-3 grid gap-1 font-mono text-sm last:mb-0" key={database.name}><strong>{database.name} · PostgreSQL {database.version} · {database.status}</strong><code className="text-[#2d6f8f]">{database.host}:5432/{database.database}</code><span>Credentials Secret: {database.credentialsSecret} · {database.instances} DB replicas{database.poolerEnabled ? ` · ${database.poolerInstances} PgBouncer (${database.poolMode})` : ''}</span></article>)}</div> : null}
      </section>

      <section className="mx-auto max-w-[1180px] overflow-hidden border border-[#c9c1af] bg-[#fffdf7e6]" aria-label="Managed platform services">
        <div className={`${rowClass} min-h-0 bg-[#17211b0f] font-mono text-[.68rem] font-black uppercase leading-none text-[#66736b] max-[860px]:hidden`}>
          <span>Name</span>
          <span>Status</span>
          <span>Image</span>
          <span>Domains</span>
          <span>Actions</span>
        </div>
        {loading ? <p className="m-0 px-4 py-[18px] font-mono text-[.82rem] font-extrabold leading-[1.4]">Loading services...</p> : null}
        {error ? <p className="m-0 px-4 py-[18px] font-mono text-[.82rem] font-extrabold leading-[1.4] text-[#d65236]">{error}</p> : null}
        {!loading && !error && apps.length === 0 ? <p className="m-0 px-4 py-[18px] font-mono text-[.82rem] font-extrabold leading-[1.4]">No platform services yet.</p> : null}
        {apps.map((app) => (
          <article className={`${rowClass} border-t border-[#c9c1afbf] [&>*]:min-w-0 [&>*]:[overflow-wrap:anywhere]`} key={app.name}>
            <strong className="font-mono text-[.9rem] font-black leading-[1.3]">{app.name}</strong>
            <span className="flex content-start flex-wrap gap-2">
              <span className={`border px-[7px] py-[5px] font-mono text-[.62rem] font-black uppercase leading-none ${app.ready ? 'border-[#517a3861] text-[#517a38]' : 'border-[#b0822e75] text-[#b0822e]'}`}>{app.status}</span>
              <small className="basis-full font-mono text-[.65rem] font-extrabold leading-[1.25] text-[#66736b]">
                {app.ready ? 'ready' : 'not ready'} / {app.replicas} replicas
              </small>
              {app.updatedAt ? <small className="basis-full font-mono text-[.65rem] font-extrabold leading-[1.25] text-[#66736b]">{app.updatedAt}</small> : null}
            </span>
            <code className="font-mono text-[.76rem] font-extrabold leading-[1.45] text-[#2d6f8f]">{app.image}</code>
            <span>{app.domains.map((domain) => domain.host).join(', ') || 'none'}</span>
            <span className="flex flex-wrap items-start gap-2">
              <label className="inline-flex min-w-0 cursor-pointer">
                <input className="absolute h-px w-px opacity-0" accept=".env,text/plain" type="file" onChange={(event) => void handleEnvFile(app, event)} />
                <span className={`${buttonClass} inline-flex items-center`}>{busyApp === app.name ? 'Working...' : 'Upload env'}</span>
              </label>
              <button className={buttonClass} disabled={busyApp === app.name} type="button" onClick={() => void handleDeleteApp(app)}>
                Delete
              </button>
            </span>
          </article>
        ))}
      </section>
    </main>
  )
}
