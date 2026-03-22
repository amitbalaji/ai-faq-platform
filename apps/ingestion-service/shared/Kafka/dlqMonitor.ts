import { Kafka, Consumer } from 'kafkajs';

export class DLQMonitor {
  private consumer: Consumer;
  private alertThreshold: number = 10; // Alert if more than 10 messages in DLQ

  constructor() {
    const kafka = new Kafka({
      clientId: 'dlq-monitor',
      brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092']
    });

    this.consumer = kafka.consumer({ groupId: 'dlq-monitoring-group' });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: ['*.dlq'] });

    let dlqMessageCount = 0;

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        dlqMessageCount++;
        
        const metadata = JSON.parse(
          message.headers?.['x-dlq-metadata']?.toString() || '{}'
        );

        console.warn(`DLQ Message received`, {
          dlqTopic: topic,
          originalTopic: metadata.originalTopic,
          errorType: metadata.errorType,
          errorMessage: metadata.errorMessage,
          retryCount: metadata.retryCount,
          totalDLQMessages: dlqMessageCount
        });

        // Alert if threshold exceeded
        if (dlqMessageCount >= this.alertThreshold) {
          await this.sendAlert(dlqMessageCount, topic);
          dlqMessageCount = 0; // Reset counter after alert
        }
      }
    });
  }

  private async sendAlert(messageCount: number, dlqTopic: string): Promise<void> {
    // Implementation for alerting (email, Slack, etc.)
    console.error(`🚨 DLQ ALERT: ${messageCount} messages in ${dlqTopic}`);
    
    // Could integrate with monitoring systems like:
    // - CloudWatch Alarms
    // - Prometheus metrics
    // - Slack notifications
    // - Email alerts
  }
}