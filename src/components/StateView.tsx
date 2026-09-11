import { AlertTriangle, Inbox, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Variant = 'empty' | 'error' | 'filtered-empty'

type Props = {
  variant?: Variant
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

const VARIANT_ICON: Record<Variant, React.ComponentType<{ className?: string }>> = {
  empty: Inbox,
  'filtered-empty': SearchX,
  error: AlertTriangle,
}

export function StateView({ variant = 'empty', title, description, actionLabel, onAction }: Props) {
  const Icon = VARIANT_ICON[variant]
  const isError = variant === 'error'

  return (
    <div
      className="flex min-h-32 flex-col items-center justify-center gap-3 px-4 py-8 text-center"
      role={isError ? 'alert' : undefined}
      data-variant={variant}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full border ${isError ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border bg-muted text-muted-foreground'}`}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="space-y-1">
        <p className={`text-sm font-medium ${isError ? 'text-destructive' : 'text-foreground'}`}>{title}</p>
        {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant={isError ? 'outline' : 'default'}
          size={isError ? 'sm' : 'default'}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
