import { useEffect, useState, type ReactNode } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { API_URL } from '../lib/config.ts'

const AUTH_KEY = 'vdpe-auth'

function LogoMark() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          d="M3.5 12.25h9.15l-1.7-1.7a.75.75 0 1 1 1.06-1.06l3.1 3.1a.75.75 0 0 1 0 1.06l-3.1 3.1a.75.75 0 1 1-1.06-1.06l1.7-1.7H3.5a.75.75 0 0 1 0-1.5Zm13.2-5.4c1.28.96 2.1 2.5 2.1 4.25 0 2.74-2.05 5.02-4.7 5.4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </span>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(() => {
    try {
      return localStorage.getItem(AUTH_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(AUTH_KEY, signedIn ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [signedIn])

  return (
    <div className="min-h-dvh bg-background px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark />
            <span className="truncate text-base font-semibold tracking-tight text-foreground">
              Viagens do Pé
            </span>
          </div>
          <Badge variant="success" className="h-auto px-3 py-1 text-xs font-medium">
            Origem fixa · PET · ida
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setSignedIn((v) => !v)}>
              {signedIn ? 'Sair' : 'Entrar'}
            </Button>
            <Avatar aria-label={signedIn ? 'Conta conectada' : 'Sem sessão'} size="default">
              <AvatarFallback
                className={
                  signedIn
                    ? 'bg-primary text-xs font-semibold text-primary-foreground'
                    : 'text-xs font-semibold'
                }
              >
                {signedIn ? 'RP' : ''}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>
        <main className="pt-5">
          <span className="sr-only">API {API_URL || 'stubs locais'}</span>
          {children}
        </main>
      </div>
    </div>
  )
}
