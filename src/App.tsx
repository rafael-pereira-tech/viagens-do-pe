import { Navigate, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Shell } from './components/Shell.tsx'
import { usePlaygroundFf } from './lib/playgroundFf.ts'
import { Dashboard } from './pages/Dashboard.tsx'
import { Playground } from './pages/Playground.tsx'

function PlaygroundRoute() {
  const enabled = usePlaygroundFf()
  if (!enabled) return <Navigate to="/" replace />
  return <Playground />
}

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/playground" element={<PlaygroundRoute />} />
        </Routes>
      </Shell>
    </TooltipProvider>
  )
}
