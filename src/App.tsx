import { Navigate, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Shell } from './components/Shell.tsx'
import { FeatureFlagsProvider, useFeatureFlags } from './lib/featureFlags.ts'
import { Dashboard } from './pages/Dashboard.tsx'
import { Playground } from './pages/Playground.tsx'

function PlaygroundRoute() {
  const { playground } = useFeatureFlags()
  if (!playground) return <Navigate to="/" replace />
  return <Playground />
}

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <FeatureFlagsProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/playground" element={<PlaygroundRoute />} />
          </Routes>
        </Shell>
      </FeatureFlagsProvider>
    </TooltipProvider>
  )
}
