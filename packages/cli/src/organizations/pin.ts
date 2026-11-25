import type { EveryOrganization } from '@protobase/query'

// The organization a host command acts on: the config's `auth.organizations.default`, the one `--organization` names,
// or every one with `--all-organizations`. The pin is a filter for whoever runs the command, not a boundary: they hold
// the database's credentials.

export type PinnedOrganization = { id: string; slug: string; name: string }

/** What a command reads its pin from, over the project's auth (`pinSource` in ./api.ts). */
export type PinSource = {
  organizationsOn: boolean
  /** `auth.organizations.default` of the config. */
  defaultOrganization?: PinnedOrganization
  /** An organization by its id or slug; null when the database has none. */
  organizationByKey: (key: string) => Promise<PinnedOrganization | null>
  /** Whether the user with `email` is a member of the organization with this id. */
  isMember: (organizationId: string, email: string) => Promise<boolean>
}

export type PinOptions = { organization?: string; allOrganizations?: boolean }

export type Pin = { organization: PinnedOrganization } | { every: EveryOrganization }

/**
 * The pin of a command named `command` with organizations on. `wide` is the command's reviewed way out, as
 * `everyOrganization('<command>: --all-organizations')`; a command without one refuses `--all-organizations`.
 */
export const resolvePin = async (source: PinSource, options: PinOptions, command: string, wide?: () => EveryOrganization): Promise<Pin> => {
  if (!source.organizationsOn) throw new Error(`protobase ${command} needs organizations: turn on auth.organizations in the config`)
  if (options.allOrganizations && options.organization !== undefined) throw new Error('Pass --organization or --all-organizations, not both')
  if (options.allOrganizations) {
    if (!wide) throw new Error(`protobase ${command} acts on one organization: pass --organization <slug> instead of --all-organizations`)
    return { every: wide() }
  }
  if (options.organization !== undefined) {
    const found = await source.organizationByKey(options.organization)
    if (!found) throw new Error(`No organization "${options.organization}"`)
    return { organization: found }
  }
  const pinned = source.defaultOrganization
  if (!pinned) throw new Error('No organization is pinned: set auth.organizations.default in the config, or pass --organization <slug> or --all-organizations')
  const found = await source.organizationByKey(pinned.id)
  if (!found) throw new Error(`The config's auth.organizations.default names organization "${pinned.slug}" (${pinned.id}), which the database does not have: pass --organization <slug> or --all-organizations`)
  return { organization: found }
}

/** The pin of a command that works without organizations too: none while they are off, which refuses the pin's flags. */
export const resolveOptionalPin = async (source: PinSource, options: PinOptions, command: string, wide?: () => EveryOrganization) => {
  if (source.organizationsOn) return resolvePin(source, options, command, wide)
  if (options.organization !== undefined || options.allOrganizations) throw new Error('--organization and --all-organizations need organizations: turn on auth.organizations in the config')
  return
}

/** What the scope of `@protobase/server`'s host functions takes: the organization's id, or every organization. */
export const scopeOf = (pin: Pin) => ('every' in pin ? pin.every : pin.organization.id)

/** The line a command prints first, naming what it acts on. */
export const pinLine = (pin: Pin) => ('every' in pin ? 'Every organization\n' : `Organization: ${pin.organization.slug} (${pin.organization.name})\n`)

/** Refuses a user outside the pinned organization, for a command that changes their whole account. */
export const checkPinnedUser = async (source: PinSource, pin: Pin, email: string) => {
  if ('every' in pin) return
  if (await source.isMember(pin.organization.id, email)) return
  throw new Error(`${email} is not a member of ${pin.organization.slug}: pass --organization <slug> for theirs, or --all-organizations to reach any user`)
}
