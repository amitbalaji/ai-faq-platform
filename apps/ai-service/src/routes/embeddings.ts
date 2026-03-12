import { Router } from 'express'
import { EmbeddingService } from '../services/embeddingService'
import { validateEmbeddingRequest } from '../middleware/validation'
import { extractIdentityHeaders, AuthenticatedRequest } from '../middleware/authMiddleware'

const router = Router()
const embeddingService = new EmbeddingService()

/**
 * Generate embeddings for text
 * POST /embeddings
 */
router.post('/', extractIdentityHeaders, validateEmbeddingRequest, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { text, model } = req.body
    
    // CHANGE: Log request with user context for audit trail
    console.log(`Embedding request from user ${req.user?.userId} in tenant ${req.user?.tenantId}`)
    
    const embedding = await embeddingService.generateEmbedding(text, model)
    
    res.json({
      embedding,
      model: model || 'nomic-embed-text',
      dimensions: embedding.length,
      // CHANGE: Include user context in response for debugging
      requestContext: {
        userId: req.user?.userId,
        tenantId: req.user?.tenantId
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * Generate embeddings for multiple texts (batch)
 * POST /embeddings/batch
 */
router.post('/batch', extractIdentityHeaders, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { texts, model } = req.body
    
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts must be a non-empty array' })
    }
    
    if (texts.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 texts per batch' })
    }
    
    // CHANGE: Log batch request with user context
    console.log(`Batch embedding request from user ${req.user?.userId} in tenant ${req.user?.tenantId}, ${texts.length} texts`)
    
    const embeddings = await embeddingService.generateBatchEmbeddings(texts, model)
    
    res.json({
      embeddings,
      model: model || 'nomic-embed-text',
      count: embeddings.length,
      // CHANGE: Include user context in response
      requestContext: {
        userId: req.user?.userId,
        tenantId: req.user?.tenantId
      }
    })
  } catch (error) {
    next(error)
  }
})

export default router