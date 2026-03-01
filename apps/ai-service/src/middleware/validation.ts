import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/errors'

export const validateEmbeddingRequest = (req: Request, res: Response, next: NextFunction) => {
  const { text, model } = req.body

  if (!text || typeof text !== 'string') {
    return next(new AppError('text is required and must be a string', 400))
  }

  if (text.trim().length === 0) {
    return next(new AppError('text cannot be empty', 400))
  }

  if (text.length > 8000) {
    return next(new AppError('text too long (max 8000 characters)', 400))
  }

  if (model && typeof model !== 'string') {
    return next(new AppError('model must be a string', 400))
  }

  next()
}

export const validateChatRequest = (req: Request, res: Response, next: NextFunction) => {
  const { messages, context, model, temperature, maxTokens } = req.body

  if (!messages || !Array.isArray(messages)) {
    return next(new AppError('messages must be an array', 400))
  }

  if (messages.length === 0) {
    return next(new AppError('messages cannot be empty', 400))
  }

  for (const message of messages) {
    if (!message.role || !message.content) {
      return next(new AppError('each message must have role and content', 400))
    }
    
    if (!['user', 'assistant', 'system'].includes(message.role)) {
      return next(new AppError('message role must be user, assistant, or system', 400))
    }
  }

  if (context && typeof context !== 'string') {
    return next(new AppError('context must be a string', 400))
  }

  if (model && typeof model !== 'string') {
    return next(new AppError('model must be a string', 400))
  }

  if (temperature && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
    return next(new AppError('temperature must be a number between 0 and 2', 400))
  }

  if (maxTokens && (typeof maxTokens !== 'number' || maxTokens < 1 || maxTokens > 4000)) {
    return next(new AppError('maxTokens must be a number between 1 and 4000', 400))
  }

  next()
}