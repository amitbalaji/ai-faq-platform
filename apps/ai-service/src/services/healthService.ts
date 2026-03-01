import { OllamaClient } from '../clients/ollamaClient'

interface HealthStatus {
  status: 'healthy' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  services?: {
    ollama: {
      status: 'healthy' | 'unhealthy'
      responseTime?: number
    }
  }
}

export class HealthService {
  private ollamaClient: OllamaClient
  private startTime: number

  constructor() {
    this.ollamaClient = new OllamaClient()
    this.startTime = Date.now()
  }

  async getBasicHealth(): Promise<HealthStatus> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: process.env.npm_package_version || '1.0.0'
    }
  }

  async getDetailedHealth(): Promise<HealthStatus> {
    const basic = await this.getBasicHealth()
    
    // Check Ollama connectivity
    const ollamaStart = Date.now()
    const ollamaHealthy = await this.ollamaClient.healthCheck()
    const ollamaResponseTime = Date.now() - ollamaStart

    const overallStatus = ollamaHealthy ? 'healthy' : 'unhealthy'

    return {
      ...basic,
      status: overallStatus,
      services: {
        ollama: {
          status: ollamaHealthy ? 'healthy' : 'unhealthy',
          responseTime: ollamaResponseTime
        }
      }
    }
  }
}