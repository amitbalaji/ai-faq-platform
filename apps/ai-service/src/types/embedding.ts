export interface EmbeddingRequest {
    text: string
    model?: string
  }
  
  export interface EmbeddingResponse {
    embedding: number[]
    model: string
    dimensions: number
  }
  
  export interface BatchEmbeddingRequest {
    texts: string[]
    model?: string
  }
  
  export interface BatchEmbeddingResponse {
    embeddings: number[][]
    model: string
    count: number
  }