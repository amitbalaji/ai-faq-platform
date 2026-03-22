import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { DLQHandler } from './dlqHandler';



export class DocumentProcessor {
  private consumer: Consumer;
  private dlqHandler: DLQHandler;

  constructor() {
    const kafka = new Kafka({
      clientId: 'document-processor',
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092']
    });

    this.consumer = kafka.consumer({ groupId: 'document-processing-group' });
    
    this.dlqHandler = new DLQHandler(kafka, {
      maxRetries: 3,
      retryDelayMs: 5000,
      dlqTopic: 'document-processing.dlq',
      originalTopic: 'document-processing'
    });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ 
      topics: ['document-processing', 'document-processing.retry'] 
    });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await this.processMessage(payload);
        } catch (error) {
          const retryCount = this.getRetryCount(payload.message);
          await this.dlqHandler.handleFailedMessage(payload, error, retryCount);
        }
      }
    });
  }

  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    
    try {
      const documentData = JSON.parse(message.value!.toString());
      
      // Process document (extract text, generate embeddings, etc.)
      await this.extractText(documentData);
      await this.generateEmbeddings(documentData);
      await this.updateDocumentStatus(documentData.documentId, 'ready');
      
      console.log(`Document processed successfully`, {
        documentId: documentData.documentId,
        topic,
        partition,
        offset: message.offset
      });
      
    } catch (error) {
      console.error(`Document processing failed`, {
        topic,
        partition,
        offset: message.offset,
        error: error.message
      });
      throw error;
    }
  }

  private getRetryCount(message: any): number {
    const retryHeader = message.headers?.['x-retry-count'];
    return retryHeader ? parseInt(retryHeader.toString()) : 0;
  }

  private async extractText(documentData: any): Promise<void> {
    // Implementation for text extraction
    if (!documentData.storageKey) {
      throw new Error('INVALID_FILE_FORMAT: Missing storage key');
    }
    // ... text extraction logic
  }

  private async generateEmbeddings(documentData: any): Promise<void> {
    // Implementation for embedding generation
    // ... embedding logic
  }

  private async updateDocumentStatus(documentId: string, status: string): Promise<void> {
    // Implementation for status update
    // ... database update logic
  }
}