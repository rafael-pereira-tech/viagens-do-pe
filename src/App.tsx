import { TooltipProvider } from '@/components/ui/tooltip'
import { Shell } from './components/Shell.tsx'
import { Dashboard } from './pages/Dashboard.tsx'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <Shell>
        <Dashboard />
      </Shell>
    </TooltipProvider>
  )
}
