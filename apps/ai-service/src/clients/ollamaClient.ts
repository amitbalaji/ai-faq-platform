import { Response } from 'express'
import { AppError } from '../utils/errors'

interface EmbeddingRequest {
  model: string
  prompt: string
}

interface CompletionRequest {
  model: string
  prompt: string
  temperature?: number
  maxTokens?: number
  stream: boolean
}

interface CompletionResponse {
  response: string
  prompt_eval_count?: number
  eval_count?: number
}

export class OllamaClient {
  private baseUrl: string
  private timeout: number

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT || '30000')
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<number[]> {
    const response = await this.makeRequest('/api/embeddings', {
      model: request.model,
      prompt: request.prompt
    })

    if (!response.embedding) {
      throw new AppError('Invalid embedding response from Ollama', 500)
    }

    return response.embedding
  }

  async generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.makeRequest('/api/generate', {
      model: request.model,
      prompt: request.prompt,
      options: {
        temperature: request.temperature,
        num_predict: request.maxTokens
      },
      stream: false
    })

    return response
  }

  async generateStreamingCompletion(request: CompletionRequest, res: Response): Promise<void> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens
          },
          stream: true
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new AppError(`Ollama request failed: ${response.statusText}`, response.status)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new AppError('No response body from Ollama', 500)
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.response) {
              res.write(`data: ${JSON.stringify({ content: data.response })}\n\n`)
            }
            if (data.done) {
              res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
              res.end()
              return
            }
          } catch (parseError) {
            console.warn('Failed to parse streaming response:', parseError)
          }
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async makeRequest(endpoint: string, body: any): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new AppError(`Ollama request failed: ${response.statusText}`, response.status)
      }

      return await response.json()
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new AppError('Ollama request timeout', 408)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }
}