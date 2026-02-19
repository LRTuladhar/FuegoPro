import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import PlansList from './pages/PlansList'
import PlanEditor from './pages/PlanEditor'
import Simulation from './pages/Simulation'
import Compare from './pages/Compare'
import Settings from './pages/Settings'
import { SimConfigProvider } from './store/simConfig'

function App() {
  return (
    <SimConfigProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/plans" replace />} />
            <Route path="plans" element={<PlansList />} />
            <Route path="plans/new" element={<PlanEditor />} />
            <Route path="plans/:id" element={<PlanEditor />} />
            <Route path="plans/:id/simulate" element={<Simulation />} />
            <Route path="compare" element={<Compare />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SimConfigProvider>
  )
}

export default App
