import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

interface DLQConfig {
  maxRetries: number;
  retryDelayMs: number;
  dlqTopic: string;
  originalTopic: string;
}

interface MessageMetadata {
  originalTopic: string;
  partition: number;
  offset: string;
  timestamp: string;
  retryCount: number;
  firstFailureTime: string;
  lastFailureTime: string;
  errorMessage: string;
  errorType: string;
}

export class DLQHandler {
  private producer: Producer;
  private config: DLQConfig;

  constructor(kafka: Kafka, config: DLQConfig) {
    this.producer = kafka.producer();
    this.config = config;
  }

  async handleFailedMessage(
    payload: EachMessagePayload,
    error: Error,
    retryCount: number = 0
  ): Promise<void> {
    const { topic, partition, message } = payload;
    
    // Check if message should be retried
    if (this.shouldRetry(error, retryCount)) {
      await this.scheduleRetry(payload, error, retryCount + 1);
      return;
    }

    // Send to DLQ if max retries exceeded
    await this.sendToDLQ(payload, error, retryCount);
  }

  private shouldRetry(error: Error, retryCount: number): boolean {
    // Don't retry if max retries exceeded
    if (retryCount >= this.config.maxRetries) {
      return false;
    }

    // Don't retry for non-retryable errors
    const nonRetryableErrors = [
      'INVALID_FILE_FORMAT',
      'FILE_TOO_LARGE',
      'MALFORMED_JSON',
      'AUTHENTICATION_FAILED'
    ];

    return !nonRetryableErrors.some(errorType => 
      error.message.includes(errorType)
    );
  }

  private async scheduleRetry(
    payload: EachMessagePayload,
    error: Error,
    retryCount: number
  ): Promise<void> {
    const { topic, partition, message } = payload;
    const retryTopic = `${topic}.retry`;
    
    const retryMessage = {
      key: message.key,
      value: message.value,
      headers: {
        ...message.headers,
        'x-retry-count': Buffer.from(retryCount.toString()),
        'x-original-topic': Buffer.from(topic),
        'x-error-message': Buffer.from(error.message),
        'x-retry-timestamp': Buffer.from(new Date().toISOString())
      }
    };

    // Delay before retry
    await new Promise(resolve => 
      setTimeout(resolve, this.config.retryDelayMs * Math.pow(2, retryCount - 1))
    );

    await this.producer.send({
      topic: retryTopic,
      messages: [retryMessage]
    });

    console.log(`Message scheduled for retry ${retryCount}/${this.config.maxRetries}`, {
      topic,
      partition,
      offset: message.offset,
      error: error.message
    });
  }

  private async sendToDLQ(
    payload: EachMessagePayload,
    error: Error,
    retryCount: number
  ): Promise<void> {
    const { topic, partition, message } = payload;
    
    const metadata: MessageMetadata = {
      originalTopic: topic,
      partition,
      offset: message.offset!,
      timestamp: message.timestamp,
      retryCount,
      firstFailureTime: this.getFirstFailureTime(message),
      lastFailureTime: new Date().toISOString(),
      errorMessage: error.message,
      errorType: error.constructor.name
    };

    const dlqMessage = {
      key: message.key,
      value: message.value,
      headers: {
        ...message.headers,
        'x-dlq-metadata': Buffer.from(JSON.stringify(metadata)),
        'x-dlq-timestamp': Buffer.from(new Date().toISOString())
      }
    };

    await this.producer.send({
      topic: this.config.dlqTopic,
      messages: [dlqMessage]
    });

    console.error(`Message sent to DLQ after ${retryCount} retries`, {
      originalTopic: topic,
      dlqTopic: this.config.dlqTopic,
      partition,
      offset: message.offset,
      error: error.message,
      metadata
    });
  }

  private getFirstFailureTime(message: any): string {
    const existingTime = message.headers?.['x-first-failure-time'];
    return existingTime ? existingTime.toString() : new Date().toISOString();
  }
}