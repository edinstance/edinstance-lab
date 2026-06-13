import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type SubmitEvent } from 'react'

import { login, signup } from '../platform/api'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

type Mode = 'login' | 'signup'

const fieldClass = 'grid gap-2 [&>span]:font-mono [&>span]:text-[.72rem] [&>span]:font-black [&>span]:uppercase [&>span]:leading-none [&>input]:min-h-[42px] [&>input]:border [&>input]:border-[#9c927f] [&>input]:bg-[#fffdf7] [&>input]:px-3 [&>input]:font-mono [&>input]:text-base [&>input]:font-black [&>input]:text-[#17211b]'
const tabClass = 'min-h-10 border border-[#9c927f] bg-transparent font-mono text-[.72rem] font-black uppercase leading-none text-[#66736b] disabled:cursor-not-allowed disabled:opacity-55'

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [platformPassword, setPlatformPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup({ name, email, password, platformPassword })
      }
      await navigate({ to: '/manage' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  function selectMode(nextMode: Mode) {
    setMode(nextMode)
    setError(null)
  }

  return (
    <main className="grid min-h-screen place-items-center p-7">
      <form className="grid w-[min(420px,calc(100vw-48px))] gap-[18px] border border-[#c9c1af] bg-[#fffdf7f0] p-6 shadow-[0_18px_45px_rgba(50,45,32,.14)]" onSubmit={handleSubmit}>
        <div>
          <p className="mb-2 mt-0 font-mono text-[.68rem] font-black uppercase leading-none text-[#66736b]">edinstance</p>
          <h1 className="m-0 text-[1.8rem] leading-none">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        </div>
        <div className="grid grid-cols-2" role="tablist" aria-label="Authentication mode">
          <button aria-selected={mode === 'login'} className={`${tabClass} ${mode === 'login' ? 'bg-[#17211b] text-[#fffdf7]' : ''}`} role="tab" type="button" onClick={() => selectMode('login')}>
            Sign in
          </button>
          <button aria-selected={mode === 'signup'} className={`${tabClass} -ml-px ${mode === 'signup' ? 'bg-[#17211b] text-[#fffdf7]' : ''}`} role="tab" type="button" onClick={() => selectMode('signup')}>
            Sign up
          </button>
        </div>
        {mode === 'signup' ? (
          <label className={fieldClass}>
            <span>Name</span>
            <input autoComplete="name" autoFocus required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        ) : null}
        <label className={fieldClass}>
          <span>Email</span>
          <input autoComplete="email" autoFocus={mode === 'login'} required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className={fieldClass}>
          <span>Account password</span>
          <input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {mode === 'signup' ? (
          <label className={fieldClass}>
            <span>Platform password</span>
            <input autoComplete="off" required type="password" value={platformPassword} onChange={(event) => setPlatformPassword(event.target.value)} />
          </label>
        ) : null}
        {error ? <p className="m-0 text-[#d65236]">{error}</p> : null}
        <button className="min-h-[42px] border border-[#17211b] bg-[#17211b] px-3 font-mono text-[.72rem] font-black uppercase text-[#fffdf7] transition-colors hover:bg-[#315c52] disabled:cursor-not-allowed disabled:opacity-55" disabled={submitting} type="submit">
          {submitting ? 'Checking...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </main>
  )
}
