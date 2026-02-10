import { PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { s3Client } from "./s3.client"
import { config } from "./config"

export async function generatePresignedUploadUrl(
  tenantId: string,
  fileName: string,
  mimeType: string
) {
  const key = `${tenantId}/${Date.now()}-${fileName}`

  const command = new PutObjectCommand({
    Bucket: config.aws.bucket,
    Key: key,
    ContentType: mimeType
  })

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 900
  })

  return { uploadUrl, storageKey: key }
}
