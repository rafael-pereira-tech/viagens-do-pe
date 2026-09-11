import { Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Shell } from './components/Shell.tsx'
import { Dashboard } from './pages/Dashboard.tsx'
import { Playground } from './pages/Playground.tsx'

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/playground" element={<Playground />} />
        </Routes>
      </Shell>
    </TooltipProvider>
  )
}
