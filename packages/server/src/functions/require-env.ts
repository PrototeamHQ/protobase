/**
 * An environment variable the function cannot work without, such as an API key: `protobase dev` reads it from `.env`,
 * `protobase serve` from its environment. A missing one is an error, so the call is a 500 the app reports.
 */
export const requireEnv = (name: string) => {
  const value = globalThis.process?.env?.[name]
  if (!value) throw new Error(`The environment variable ${name} is not set`)
  return value
}
