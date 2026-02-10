export const config = {
    port: Number(process.env.PORT || 4003),
    useS3: process.env.USE_S3 === "true",
    aws: {
      region: process.env.AWS_REGION!,
      bucket: process.env.AWS_BUCKET!
    }
  }
  