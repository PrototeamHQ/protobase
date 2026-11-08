/**
 * The variables Bun's S3 client reads from the server's environment even when given its own settings: the endpoint and
 * region when a configuration leaves them out, and the session token always, which would sign an author's request as
 * the operator.
 */
export const s3EnvironmentVariables = ['S3_ENDPOINT', 'AWS_ENDPOINT', 'S3_REGION', 'AWS_REGION', 'S3_SESSION_TOKEN', 'AWS_SESSION_TOKEN'] as const

/** The first of those variables set in `environment`, or `undefined` when an S3 configuration is safe to use. */
export const s3EnvironmentProblem = (environment: Record<string, string | undefined>) => s3EnvironmentVariables.find((name) => environment[name] !== undefined && environment[name] !== '')
