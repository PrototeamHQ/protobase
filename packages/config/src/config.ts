import type {
  AdminOptions,
  AppIdentity,
  AssistantOptions,
  AuthenticateSettings,
  AuthSettings,
  CallsOptions,
  EventsOptions,
  FileProviderSettings,
  FilesOptions,
  HistoryOptions,
  JobDeclaration,
  MobileConfig,
  NotificationsOptions,
  RealtimeOptions,
  WebhooksOptions,
} from '@protobase/server'

/**
 * `auth`: sign-in (see `AuthSettings`). Its URL, secrets and name are the app's (`url`, `secret`, `previousSecrets`,
 * `name`), and so are its signing keys' (`signingKeyDays`, `signingKeyGraceDays`).
 */
export type AuthConfig = Omit<AuthSettings, 'baseURL' | 'secret' | 'appName' | 'previousSecrets' | 'signingKeyDays' | 'signingKeyGraceDays'>

/** `files`: where file fields keep their bytes (see `FilesOptions`), with the providers as data. */
export type FilesConfig = Omit<FilesOptions, 'providers' | 'sharp'> & {
  /**
   * Providers by name: `{ kind: 'local', dir }`, `{ kind: 's3', bucket }`, or `{ kind: 'custom' }`, the default export
   * of `files/<name>.ts`. Name the role (`archive`), not the vendor.
   */
  providers?: Record<string, FileProviderSettings | { kind: 'custom' }>
  /** The image library of image fields' variants and placeholders, by its package name, loaded when the app serves. */
  images?: 'sharp'
}

/** The app itself: its name, address, secret, language, time zone and colours. */
type AppKeys = AppIdentity & {
  /** The app's name: sign-in prompts, the mail it sends, the tab titles and the installed app; `PROTOBASE_APP_NAME` overrides it. Default `Protobase`. */
  name?: string
  /**
   * The app's public URL, such as `https://admin.example.com`: the issuer of its tokens and where its emails link to.
   * Default `PROTOBASE_URL`, or in `protobase dev` the dev server's own; required with sign-in otherwise.
   */
  url?: string
  /**
   * The app's secret, made with `openssl rand -base64 32`: it signs session cookies, upload tickets and download links
   * and public forms' bot checks, and encrypts the token signing keys. Default `PROTOBASE_SECRET`; required with sign-in.
   */
  secret?: string
  /**
   * The app's secrets before `secret`, newest first: what they encrypted still decrypts, so the token signing keys keep
   * signing after the secret changes. Keep one listed while the keys it encrypted sign (`signingKeyDays`), and while
   * two-factor authenticator apps set up with it are in use. Default `PROTOBASE_PREVIOUS_SECRETS`, comma separated.
   */
  previousSecrets?: string[]
  /** Days a token signing key signs before a new one takes over. Default 30. */
  signingKeyDays?: number
  /** Days a replaced signing key still verifies the tokens it signed. Default 7, at least 1. */
  signingKeyGraceDays?: number
  /** The language of the admin app's built-in screens and of its numbers and dates, for every user: `'en'` or `'nl'`; unset, each user's browser's. */
  locale?: NonNullable<AdminOptions['locale']>
  /** The time zone the jobs' schedules are read in unless a job names its own, such as `Europe/Amsterdam`. Default `UTC`. */
  timezone?: string
}

/** The API's options (see `AdminOptions`), as data, four of them renamed so they read plainly beside the rest. */
type ApiOptionKeys = Omit<AdminOptions, 'basePath' | 'roles' | 'writeHooks' | 'audit' | 'onUnhandledError' | 'assistant' | 'locale' | 'mcp' | 'runtime' | 'sources'> & {
  /** The path of the REST API; default `/api/v1` (`AdminOptions['basePath']`). */
  apiPath?: AdminOptions['basePath']
  /** The write hooks by name, run in this order inside each write's transaction; each is `hooks/<name>.ts`. */
  writeHooks?: string[]
  assistant?: Omit<AssistantOptions, 'tools' | 'fetch'> | false
  /**
   * The MCP endpoint's tools: `sql`, `writes`, or `false` for a host that serves its own (`AdminOptions['mcp']`);
   * `auth.mcp` turns MCP on. The app's own tools are mcp/tools.ts's.
   */
  mcpEndpoint?: Omit<Exclude<AdminOptions['mcp'], false | undefined>, 'tools'> | false
  /** The runtime updates endpoint behind the top bar's update button (`AdminOptions['runtime']`). */
  runtimeUpdates?: AdminOptions['runtime']
  /** Other Protobase APIs whose resources the admin app draws as its own (`AdminOptions['sources']`). */
  remoteResources?: AdminOptions['sources']
}

/**
 * What `protobase.config.ts` (or `protobase.config.json`) describes: one flat object of plain data, everything optional.
 * The project's code is found by its path: resources in `config/`, roles in `config/roles.ts`, functions in
 * `functions/`, each job's run in `jobs/<name>.ts`, each write hook in `hooks/<name>.ts`, and the auth hooks in
 * `auth/hooks.ts`, among others (see the config reference). The database is `DATABASE_URL`'s.
 */
export type ProtobaseConfig = AppKeys &
  ApiOptionKeys & {
    /**
     * Sign-in (see `AuthConfig`), on by default with its own defaults; `false` turns it off, as does an
     * `authenticate.jwksUrl` that trusts an auth server elsewhere. Its hooks are `auth/hooks.ts`.
     */
    auth?: AuthConfig | false
    /** How the API verifies tokens; default the tokens of `auth` (see `AuthenticateSettings`). */
    authenticate?: AuthenticateSettings
    /** The app's jobs by name: what each does, its arguments and when it runs; its run is `jobs/<name>.ts`. */
    jobs?: Record<string, JobDeclaration>
    files?: FilesConfig
    /** Where the changes that resources' events are raised from are captured (see `EventsOptions`). */
    events?: EventsOptions
    /** How long the history of resources with `.history()` is kept (see `HistoryOptions`). */
    history?: HistoryOptions
    /** Webhook subscriptions made in the admin app (see `WebhooksOptions`); `{}` turns them on. */
    webhooks?: Omit<WebhooksOptions, 'ownerRoles'>
    /** How supabase-js's Realtime is served: `{ processes: 'many' }` when several processes serve the app (see `RealtimeOptions`). */
    realtime?: RealtimeOptions
    /** Each user's devices and inbox (see `NotificationsOptions`); `{}` turns them on. */
    notifications?: Omit<NotificationsOptions, 'store' | 'historyStore' | 'senders'>
    /** The media server behind the calls functions admit members to with `calls.join` (see `CallsOptions`). */
    calls?: CallsOptions
    /** The app's iOS and Android build (see `MobileConfig`). */
    mobile?: MobileConfig
  }

/**
 * Which command reads the config: `dev`, `build`, `serve` (also a worker and the serve runtime's `create-admin`), or `tool`, any
 * other command over the project, such as `migration`, `users` or `doctor`.
 */
export type ConfigCommand = 'dev' | 'build' | 'serve' | 'tool'

/** What a config function is called with. */
export type ConfigEnv = {
  command: ConfigCommand
  /** The environment: `process.env`, with the project's .env loaded. */
  env: Record<string, string | undefined>
  /** The project's folder. */
  root: string
}

/** A config, or a function of the `ConfigEnv` that returns one, at once or as a promise. */
export type ConfigFunction = (configEnv: ConfigEnv) => ProtobaseConfig | Promise<ProtobaseConfig>

/** What `protobase.config.ts` default-exports. */
export type ConfigInput = ProtobaseConfig | ConfigFunction
