import { createContext, useContext, useEffect, useState } from 'react'
import { getSimConfig, updateSimConfig } from '../api/client'

const SimConfigContext = createContext(null)

const DEFAULTS = { numRuns: 1000, lowerPct: 10, upperPct: 90 }

export function SimConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getSimConfig()
      .then(res => {
        setConfig({
          numRuns: res.data.num_runs,
          lowerPct: res.data.lower_percentile,
          upperPct: res.data.upper_percentile,
        })
      })
      .catch(() => { /* keep defaults on error */ })
      .finally(() => setLoaded(true))
  }, [])

  const saveConfig = async (cfg) => {
    await updateSimConfig({
      num_runs: cfg.numRuns,
      lower_percentile: cfg.lowerPct,
      upper_percentile: cfg.upperPct,
    })
    setConfig(cfg)
  }

  return (
    <SimConfigContext.Provider value={{ config, setConfig, saveConfig, loaded }}>
      {children}
    </SimConfigContext.Provider>
  )
}

export const useSimConfig = () => useContext(SimConfigContext)
