
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
  }
  
  export interface ChatCompletionRequest {
    messages: ChatMessage[]
    context?: string
    model?: string
    temperature?: number
    maxTokens?: number
  }
  
  export interface ChatCompletionResponse {
    response: string
    model: string
    usage: {
      promptTokens: number
      completionTokens: number
    }
  }