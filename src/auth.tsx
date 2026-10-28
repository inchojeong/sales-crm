import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase, supabaseConfigured, type Profile } from './lib/supabase'

interface AuthState {
  ready: boolean
  profile: Profile | null
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthGate')
  return value
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(!supabaseConfigured)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const ticket = useRef(0)
  const approvedUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true

    async function accept(userId: string | null) {
      if (userId && approvedUserId.current === userId) return
      const current = ++ticket.current
      if (!userId) {
        approvedUserId.current = null
        if (active && current === ticket.current) {
          setProfile(null)
          setReady(true)
        }
        return
      }
      if (active) setReady(false)
      const { data, error } = await client
        .from('profiles')
        .select('id, email, display_name, role, approved')
        .eq('id', userId)
        .maybeSingle()
      if (!active || current !== ticket.current) return
      if (error || !data?.approved) {
        if (active) {
          approvedUserId.current = null
          setProfile(null)
          setMessage(
            error
              ? '계정 상태를 확인하지 못했습니다. 관리자에게 문의해 주세요.'
              : '관리자 승인 후 사용할 수 있습니다.',
          )
          setReady(true)
        }
        if (active && current === ticket.current) await client.auth.signOut()
        return
      }
      approvedUserId.current = data.id
      setProfile(data as Profile)
      setMessage('')
      setReady(true)
    }

    void client.auth.getSession().then(({ data: sessionData }) => {
      void accept(sessionData.session?.user.id ?? null)
    })

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      window.setTimeout(() => {
        void accept(session?.user.id ?? null)
      }, 0)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut({ scope: 'local' })
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!email || !password) {
      setMessage('이메일과 비밀번호를 입력해 주세요.')
      return
    }
    setSubmitting(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      const text = error.message.toLowerCase()
      if (text.includes('invalid login credentials')) {
        setMessage('이메일 또는 비밀번호를 확인해 주세요.')
      } else if (text.includes('email not confirmed')) {
        setMessage('이메일 인증이 완료되지 않았습니다. 관리자에게 문의해 주세요.')
      } else {
        setMessage('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      }
    }
  }

  if (!supabaseConfigured) {
    return <AuthContext.Provider value={{ ready: true, profile: null, signOut }}>{children}</AuthContext.Provider>
  }

  if (!ready) {
    return (
      <div className="stage">
        <div className="auth-screen">
          <p className="auth-status">로그인 정보를 확인하고 있습니다.</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="stage">
        <div className="auth-screen">
          <form className="auth-card" onSubmit={signIn}>
            <h1>영업활동</h1>
            <p className="page-intro">승인된 팀원 계정으로 로그인합니다.</p>
            <div className="auth-fields">
              <label className="field">
                <span className="field-label">이메일</span>
                <input className="input" name="email" type="email" autoComplete="username" />
              </label>
              <label className="field">
                <span className="field-label">비밀번호</span>
                <input className="input" name="password" type="password" autoComplete="current-password" />
              </label>
            </div>
            {message ? <p className="auth-error">{message}</p> : null}
            <button className="btn primary" type="submit" disabled={submitting}>
              {submitting ? '로그인 중' : '로그인'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={{ ready: true, profile, signOut }}>{children}</AuthContext.Provider>
}
