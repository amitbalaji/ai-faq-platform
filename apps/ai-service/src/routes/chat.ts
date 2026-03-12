import { Router } from 'express'
import { ChatService } from '../services/chatService'
import { validateChatRequest } from '../middleware/validation'
import { extractIdentityHeaders, AuthenticatedRequest } from '../middleware/authMiddleware'

const router = Router()
const chatService = new ChatService()

/**
 * Generate chat completion
 * POST /chat/completions
 */
router.post('/completions', extractIdentityHeaders, validateChatRequest, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { messages, context, model, temperature, maxTokens } = req.body
    
    // CHANGE: Log chat request with user context for audit trail
    console.log(`Chat completion request from user ${req.user?.userId} in tenant ${req.user?.tenantId}`)
    
    const response = await chatService.generateCompletion({
      messages,
      context,
      model,
      temperature,
      maxTokens
    })
    
    res.json({
      response,
      model: model || 'llama3',
      usage: {
        promptTokens: response.promptTokens || 0,
        completionTokens: response.completionTokens || 0
      },
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

/**
 * Generate streaming chat completion
 * POST /chat/stream
 */
router.post('/stream', extractIdentityHeaders, validateChatRequest, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { messages, context, model, temperature, maxTokens } = req.body
    
    // CHANGE: Log streaming request with user context
    console.log(`Streaming chat request from user ${req.user?.userId} in tenant ${req.user?.tenantId}`)
    
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    
    await chatService.generateStreamingCompletion({
      messages,
      context,
      model,
      temperature,
      maxTokens
    }, res)
    
  } catch (error) {
    next(error)
  }
})

export default router