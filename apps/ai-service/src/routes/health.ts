import { Router } from 'express'
import { HealthService } from '../services/healthService'

const router = Router()
const healthService = new HealthService()

/**
 * Basic health check
 * GET /health
 */
router.get('/', async (req, res) => {
  const health = await healthService.getBasicHealth()
  res.status(health.status === 'healthy' ? 200 : 503).json(health)
})

/**
 * Detailed health check including Ollama connectivity
 * GET /health/detailed
 */
router.get('/detailed', async (req, res) => {
  const health = await healthService.getDetailedHealth()
  res.status(health.status === 'healthy' ? 200 : 503).json(health)
})

export default router