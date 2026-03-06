// CHANGE: Improved chunking strategy for better semantic coherence
export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const chunks: string[] = []
  let currentChunk = ""
  let currentSize = 0

  for (const sentence of sentences) {
    const sentenceLength = sentence.trim().length
    
    // CHANGE: If adding this sentence exceeds chunk size, finalize current chunk
    if (currentSize + sentenceLength > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      
      // CHANGE: Create overlap by keeping last portion of current chunk
      const words = currentChunk.split(' ')
      const overlapWords = words.slice(-Math.floor(overlap / 6)) // Approximate word count for overlap
      currentChunk = overlapWords.join(' ') + ' ' + sentence.trim()
      currentSize = currentChunk.length
    } else {
      currentChunk += ' ' + sentence.trim()
      currentSize += sentenceLength
    }
  }

  // CHANGE: Add final chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter(chunk => chunk.length > 50) // CHANGE: Filter out very short chunks
}