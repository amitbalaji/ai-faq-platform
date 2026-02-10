import { S3Client } from "@aws-sdk/client-s3"
import { config } from "./config"

export const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
})
