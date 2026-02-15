import { Router } from 'express'
import { EmbeddingService } from '../services/embeddingService'
import { validateEmbeddingRequest } from '../middleware/validation'

const router = Router()
const embeddingService = new EmbeddingService()

/**
 * Generate embeddings for text
 * POST /embeddings
 */
router.post('/', validateEmbeddingRequest, async (req, res, next) => {
  try {
    const { text, model } = req.body
    
    const embedding = await embeddingService.generateEmbedding(text, model)
    
    res.json({
      embedding,
      model: model || 'nomic-embed-text',
      dimensions: embedding.length
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Generate embeddings for multiple texts (batch)
 * POST /embeddings/batch
 */
router.post('/batch', async (req, res, next) => {
  try {
    const { texts, model } = req.body
    
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts must be a non-empty array' })
    }
    
    if (texts.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 texts per batch' })
    }
    
    const embeddings = await embeddingService.generateBatchEmbeddings(texts, model)
    
    res.json({
      embeddings,
      model: model || 'nomic-embed-text',
      count: embeddings.length
    })
  } catch (error) {
    next(error)
  }
})

export default router