import { Router } from 'express'
import { ChatService } from '../services/chatService'
import { validateChatRequest } from '../middleware/validation'

const router = Router()
const chatService = new ChatService()

/**
 * Generate chat completion
 * POST /chat/completions
 */
router.post('/completions', validateChatRequest, async (req, res, next) => {
  try {
    const { messages, context, model, temperature, maxTokens } = req.body
    
    const response = await chatService.generateCompletion({
      messages,
      context,
      model,
      temperature,
      maxTokens
    })
    
    res.json({
      response,
      model: model || 'llama2',
      usage: {
        promptTokens: response.promptTokens || 0,
        completionTokens: response.completionTokens || 0
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
router.post('/stream', validateChatRequest, async (req, res, next) => {
  try {
    const { messages, context, model, temperature, maxTokens } = req.body
    
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