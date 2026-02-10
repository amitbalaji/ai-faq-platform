import { Kafka, Partitioners } from "kafkajs"

const kafka = new Kafka({
  clientId: "document-service",
  brokers: ["localhost:9092"]
})


export const producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner
  })

let connected = false

export async function connectProducer() {
  if (!connected) {
    await producer.connect()
    connected = true
    console.log("Kafka producer connected")
  }
}

export async function publishDocumentUploaded(event: {
  eventId: string
  documentId: string
  tenantId: string
  storageKey: string
  fileName: string
}) {
  await producer.send({
    topic: "document.uploaded",
    messages: [
      {
        key: event.tenantId, // partition key
        value: JSON.stringify({
          eventType: "DOCUMENT_UPLOADED",
          timestamp: new Date().toISOString(),
          ...event
        })
      }
    ]
  })
}
