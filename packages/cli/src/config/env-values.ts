// A value of a config read from the environment where it runs, which JSON writes as `{ "$env": "NAME" }`: with
// `default` when the variable is unset or empty, and with `split` a list of its non-empty parts. A TypeScript config
// may write the same, or read `env` itself.

type EnvValue = { $env: string; default?: unknown; split?: string }

const isEnvValue = (value: unknown): value is EnvValue => typeof value === 'object' && value !== null && typeof (value as EnvValue).$env === 'string'

const envValue = ({ $env, default: fallback, split }: EnvValue, env: Record<string, string | undefined>) => {
  const text = env[$env]?.trim() || undefined
  if (text === undefined) return fallback
  return split === undefined ? text : text.split(split).map((part) => part.trim()).filter(Boolean)
}

/** `value` with every `$env` value in it read from `env`; one whose variable is unset and has no default is left out. */
export const resolveEnvValues = (value: unknown, env: Record<string, string | undefined>, label: string): unknown => {
  if (isEnvValue(value)) return envValue(value, env)
  if (Array.isArray(value)) return value.map((item) => resolveEnvValues(item, env, label))
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (key === '$env') throw new Error(`${label}: "$env" names a variable by a string, not ${JSON.stringify(item)}`)
      const resolved = resolveEnvValues(item, env, label)
      return resolved === undefined ? [] : [[key, resolved]]
    }),
  )
}
