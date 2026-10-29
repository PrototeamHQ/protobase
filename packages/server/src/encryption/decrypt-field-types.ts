/** One record's key: its value, or its parts in the order of the resource's primary key. */
export type RecordKey = string | number | readonly (string | number)[]

/** Reads one encrypted field of one record as its cleartext, or `null` when it is empty. */
export type DecryptField = (resource: string, key: RecordKey, field: string) => Promise<string | null>

/**
 * Who reads, as the audit names them: a job, or a function with its caller and the request's origin (`AuditOrigin`).
 * Filled in by the runtime, never by app code.
 */
export type FieldReader = { job: string } | { function: string; actor: { id: string | number; roles: string[] }; origin: { userAgent?: string; forwardedFor?: string } }

/** The app's server-side read of encrypted fields, for the reader the runtime names. */
export type FieldDecrypter = (reader: FieldReader) => DecryptField
