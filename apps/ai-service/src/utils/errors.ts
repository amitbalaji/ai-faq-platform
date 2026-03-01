export class AppError extends Error {
    public statusCode: number
    public isOperational: boolean
  
    constructor(message: string, statusCode: number = 500) {
      super(message)
      this.statusCode = statusCode
      this.isOperational = true
  
      Error.captureStackTrace(this, this.constructor)
    }
  }
  
  export class ValidationError extends AppError {
    constructor(message: string) {
      super(message, 400)
      this.name = 'ValidationError'
    }
  }
  
  export class TimeoutError extends AppError {
    constructor(message: string = 'Request timeout') {
      super(message, 408)
      this.name = 'TimeoutError'
    }
  }