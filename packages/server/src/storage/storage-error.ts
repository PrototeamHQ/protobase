import { isDatabaseError } from '../error-handler'
import { HttpProblem } from '../problem'

/**
 * An error as Supabase Storage sends it, which storage-js hands to the app as `error`: the HTTP status is 400 for any
 * refusal and 500 for a failure, and `statusCode` in the body says what it was (`404`, `403`, `409`, …).
 */
export class StorageError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly error: string,
    message: string,
  ) {
    super(message)
  }

  get status() {
    return this.statusCode === 500 ? 500 : 400
  }

  get body() {
    return { statusCode: String(this.statusCode), code: this.code, error: this.error, message: this.message }
  }
}

export const objectNotFound = () => new StorageError(404, 'NoSuchKey', 'not_found', 'Object not found')
export const bucketNotFound = () => new StorageError(404, 'NoSuchBucket', 'Bucket not found', 'Bucket not found')
export const accessDenied = (message = 'new row violates row-level security policy') => new StorageError(403, 'AccessDenied', 'Unauthorized', message)
export const alreadyExists = () => new StorageError(409, 'Duplicate', 'Duplicate', 'The resource already exists')
export const invalidRequest = (message: string) => new StorageError(400, 'InvalidRequest', 'InvalidRequest', message)
export const invalidKey = (key: string) => new StorageError(400, 'InvalidKey', 'InvalidKey', `Invalid key: ${key}`)
export const invalidBucketName = () => new StorageError(400, 'InvalidBucketName', 'Invalid Input', 'Bucket name invalid')
export const invalidSignature = () => new StorageError(400, 'InvalidSignature', 'InvalidSignature', 'Invalid signature')
export const expiredSignature = () => new StorageError(400, 'ExpiredToken', 'ExpiredToken', 'The provided token has expired.')
export const tooLarge = () => new StorageError(413, 'EntityTooLarge', 'Payload too large', 'The object exceeded the maximum allowed size')
export const mimeTypeRefused = (type: string) => new StorageError(415, 'InvalidMimeType', 'invalid_mime_type', `mime type ${type} is not supported`)
export const bucketNotEmpty = () => new StorageError(409, 'ResourceNotEmpty', 'ResourceNotEmpty', 'The bucket you tried to delete is not empty')

// The database errors a request can cause, as Supabase Storage reports them.
const databaseError = (code: string, message: string) => {
  if (code === '42501') return accessDenied(message.includes('row-level security') ? undefined : message)
  if (code === '23505') return alreadyExists()
  if (code === '23503') return new StorageError(404, 'InvalidRequest', 'InvalidRequest', 'The related resource does not exist')
  if (code === '42P01' || code === '3F000') return new StorageError(500, 'DatabaseError', 'DatabaseError', 'This app has no storage schema: restore one with protobase import supabase')
  return undefined
}

/**
 * The Storage error an error stands for: its own, a refusal of the database's (RLS, a duplicate key, a missing bucket),
 * or a problem such as a full provider's 507 and the caller's 401. Other errors give `undefined`.
 */
export const storageErrorOf = (error: unknown): StorageError | undefined => {
  if (error instanceof StorageError) return error
  if (error instanceof HttpProblem) return new StorageError(error.status, error.slug, error.title, error.detail)
  if (!isDatabaseError(error)) return undefined
  return databaseError(error.code, (error as unknown as Error).message)
}

export const errorResponse = (error: StorageError) =>
  new Response(JSON.stringify(error.body), { status: error.status, headers: { 'content-type': 'application/json; charset=utf-8' } })
