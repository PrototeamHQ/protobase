// The value the examples' and presets' .env.example hold, which anyone who has read one knows.
const placeholder = /^change-?me/i

/**
 * A warning when BETTER_AUTH_SECRET is still the placeholder of .env.example: whoever knows it can sign session
 * cookies for the app. Undefined otherwise.
 */
export const placeholderSecretWarning = (env: NodeJS.ProcessEnv) =>
  env.BETTER_AUTH_SECRET && placeholder.test(env.BETTER_AUTH_SECRET)
    ? 'BETTER_AUTH_SECRET is still the placeholder from .env.example, which signs session cookies anyone can forge; set it to the output of `openssl rand -base64 32`'
    : undefined
