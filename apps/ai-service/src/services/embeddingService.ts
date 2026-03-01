import { OllamaClient } from '../clients/ollamaClient'
import { AppError } from '../utils/errors'

export class EmbeddingService {
  private ollamaClient: OllamaClient

  constructor() {
    this.ollamaClient = new OllamaClient()
  }

  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new AppError('Text cannot be empty', 400)
    }

    if (text.length > 8000) {
      throw new AppError('Text too long (max 8000 characters)', 400)
    }

    try {
      const embedding = await this.ollamaClient.generateEmbedding({
        model: model || 'nomic-embed-text',
        prompt: text.trim()
      })

      return embedding
    } catch (error) {
      console.error('Embedding generation failed:', error)
      throw new AppError('Failed to generate embedding', 500)
    }
  }

  async generateBatchEmbeddings(texts: string[], model?: string): Promise<number[][]> {
    const embeddings: number[][] = []
    
    // Process in parallel with concurrency limit
    const concurrency = 5
    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency)
      const batchPromises = batch.map(text => this.generateEmbedding(text, model))
      const batchResults = await Promise.all(batchPromises)
      embeddings.push(...batchResults)
    }

    return embeddings
  }
}