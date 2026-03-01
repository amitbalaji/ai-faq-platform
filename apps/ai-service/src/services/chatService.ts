import { Response } from 'express'
import { OllamaClient } from '../clients/ollamaClient'
import { AppError } from '../utils/errors'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatCompletionRequest {
  messages: ChatMessage[]
  context?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

interface ChatCompletionResponse {
  content: string
  promptTokens?: number
  completionTokens?: number
}

export class ChatService {
  private ollamaClient: OllamaClient

  constructor() {
    this.ollamaClient = new OllamaClient()
  }

  async generateCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { messages, context, model, temperature, maxTokens } = request

    if (!messages || messages.length === 0) {
      throw new AppError('Messages array cannot be empty', 400)
    }

    const prompt = this.buildPrompt(messages, context)

    try {
      const response = await this.ollamaClient.generateCompletion({
        model: model || 'llama2',
        prompt,
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 2000,
        stream: false
      })

      return {
        content: response.response,
        promptTokens: response.prompt_eval_count,
        completionTokens: response.eval_count
      }
    } catch (error) {
      console.error('Chat completion failed:', error)
      throw new AppError('Failed to generate chat completion', 500)
    }
  }

  async generateStreamingCompletion(request: ChatCompletionRequest, res: Response): Promise<void> {
    const { messages, context, model, temperature, maxTokens } = request
    const prompt = this.buildPrompt(messages, context)

    try {
      await this.ollamaClient.generateStreamingCompletion({
        model: model || 'llama2',
        prompt,
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 2000,
        stream: true
      }, res)
    } catch (error) {
      console.error('Streaming completion failed:', error)
      res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`)
      res.end()
    }
  }

  private buildPrompt(messages: ChatMessage[], context?: string): string {
    let prompt = ''
    
    if (context) {
      prompt += `Context: ${context}\n\n`
    }
    
    prompt += messages.map(msg => `${msg.role}: ${msg.content}`).join('\n')
    
    return prompt
  }
}