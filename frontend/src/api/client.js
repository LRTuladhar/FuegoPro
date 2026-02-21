import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const checkHealth = () => api.get('/health')

// Plans
export const getPlans      = ()         => api.get('/plans')
export const getPlan       = (id)       => api.get(`/plans/${id}`)
export const createPlan    = (data)     => api.post('/plans', data)
export const updatePlan    = (id, data) => api.put(`/plans/${id}`, data)
export const deletePlan    = (id)       => api.delete(`/plans/${id}`)
export const duplicatePlan = (id)       => api.post(`/plans/${id}/duplicate`)

// Simulation
export const runSimulation        = (planId, params = {}) => api.post(`/simulate/${planId}`, null, { params })
export const getSimulationResults = (planId) => api.get(`/simulate/${planId}/results`)
export const getSimulationDebug   = (planId, band = 'median') => api.get(`/simulate/${planId}/debug`, { params: { band } })
export const compareSimulations   = (planIds, body = {}) => api.post('/simulate/compare', { plan_ids: planIds, ...body })

// Config
export const getSimConfig    = ()     => api.get('/config/simulation')
export const updateSimConfig = (data) => api.put('/config/simulation', data)

export default api
