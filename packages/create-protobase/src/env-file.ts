const setting = (text: string, name: string) => {
  const line = text.split('\n').find((line) => line.startsWith(`${name}=`))
  if (line === undefined) throw new Error(`.env.example has no ${name}`)
  return line.slice(name.length + 1).trim()
}

const replaceSetting = (text: string, name: string, value: string) =>
  text
    .split('\n')
    .map((line) => (line.startsWith(`${name}=`) ? `${name}=${value}` : line))
    .join('\n')

/** The DATABASE_URL of a preset's .env.example. */
export const databaseUrl = (example: string) => new URL(setting(example, 'DATABASE_URL'))

/** `example`, a preset's .env.example, with `url` as its DATABASE_URL. */
export const withDatabaseUrl = (example: string, url: string) => replaceSetting(example, 'DATABASE_URL', url)

/** `example`, a preset's .env.example, with its DATABASE_URL on `port`. */
export const withDatabasePort = (example: string, port: number) => {
  const url = databaseUrl(example)
  url.port = String(port)
  return withDatabaseUrl(example, url.toString())
}

/** `url` without its password, for a file that is committed. */
export const withoutPassword = (url: string) => {
  const parsed = new URL(url)
  parsed.password = ''
  return parsed.toString()
}

/** A new project's .env: its .env.example with `secret` as PROTOBASE_SECRET in place of the placeholder. */
export const envFile = (example: string, secret: string) => {
  setting(example, 'PROTOBASE_SECRET')
  return replaceSetting(example, 'PROTOBASE_SECRET', secret)
}
