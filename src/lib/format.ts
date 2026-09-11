const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const brlWhole = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
})

export function formatBrl(value: number, whole = false): string {
  return (whole ? brlWhole : brl).format(value)
}

export function formatMilheiro(value: number): string {
  return brl.format(value)
}

export function formatMiles(value: number): string {
  return integer.format(value)
}

export function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  return shortDate.format(d).replace('.', '')
}

export function formatRoute(origin: string, destination: string): string {
  return `${origin} → ${destination}`
}
