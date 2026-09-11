import { Button } from '@/components/ui/button'

export function EmptyHint({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {actionLabel && onAction ? (
        <Button type="button" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
