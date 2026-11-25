import type { DefaultOrganization } from '@protobase/server'
import type { OffChoice } from '@protobase/server/internal'
import type { OrganizationsOffFacts } from './organizations-off-facts'
import type { RevivedRows } from './revival-rows'
import type { KeptModule } from './snapshot-file'

// What `protobase migration` asks on a terminal about the modules the config turns off, or on again.

export type Ask = (question: string) => Promise<string>

// What the rows of a module stand for once it is on again, where they act for someone.
const rowsNote = (module: KeptModule['module']) =>
  module === 'personal_access_tokens'
    ? "\n  Its tokens stay valid unless deleted: once it is on again, each acts again for its user, refused while the user is banned, the token expired or the user no longer holds the token's role."
    : ''

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// What goes dark as organizations turn off, when the database says.
const darkNote = (module: KeptModule['module'], facts: OrganizationsOffFacts | undefined) =>
  module === 'organizations' && facts
    ? `\n  While organizations are off, the default organization stands in for all of them, and only its members can sign in. That locks out ${plural(facts.outside, 'person', 'people')} and stops ${plural(facts.otherTokens, 'personal access token', 'personal access tokens')} created outside it from working.`
    : ''

/** The question that chooses what becomes of the tables of the modules turned off, saying what goes dark with organizations (`facts`). */
export const offQuestion = (modules: readonly Pick<KeptModule, 'module'>[], facts?: OrganizationsOffFacts) =>
  `${modules.map(({ module }) => module).join(', ')} is off in the config. What becomes of its tables and rows?\n  keep: they stay as they are, and turning it on again goes on from them. Archive and delete are coming soon.${modules.map(({ module }) => rowsNote(module) + darkNote(module, facts)).join('')}\n  [k]eep (k): `

/** Asks what becomes of the tables of the modules turned off: keep, the default and for now the only choice. */
export const chooseOff =
  (ask: Ask) =>
  async (modules: readonly Pick<KeptModule, 'module'>[], facts?: OrganizationsOffFacts): Promise<OffChoice> => {
    const answer = (await ask(offQuestion(modules, facts))).trim().toLowerCase()
    if (answer === '' || answer === 'k' || answer === 'keep') return 'keep'
    throw new Error(`"${answer}" is not a choice: keep is the only one for now`)
  }

/** The refusal of a module turned on again while its kept tables hold rows, with the way through. */
export const revivalRefused = ({ module, found }: RevivedRows) =>
  `${module} is on again while its kept tables hold rows: ${found}. Delete them in a migration of the project's own first, or bring them back: pass --force to write the migration, and apply it with \`protobase migrate --force\``

/** Asks whether to bring back the rows of a module turned on again. */
export const confirmRevival =
  (ask: Ask) =>
  async (rows: RevivedRows) => {
    const question = `${rows.module} is on again, and its kept tables hold rows: ${rows.found}. Bring them back into use?${rowsNote(rows.module)}\n  The migration then applies with \`protobase migrate --force\`. [y/N] `
    const answer = (await ask(question)).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  }

/** The way on once the store's only organization is chosen as the default: the config's entry for it, then a new run. */
export const defaultChosen = ({ id, name, slug }: DefaultOrganization) =>
  `Nothing was written. Add \`default: { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, slug: ${JSON.stringify(slug)} }\` to \`auth.organizations\` in your config, and set \`authenticate.tenant\` to ${JSON.stringify(id)}. Then run \`protobase migration\` again.`

/** Asks whether the store's only organization, which is not the default one, becomes the default. */
export const offerDefault =
  (ask: Ask) =>
  async (organization: DefaultOrganization) => {
    const answer = (await ask(`The store's only organization, ${organization.name} (${organization.slug}), is not the default organization, so nobody could sign in while organizations are off. Make ${organization.name} the default organization? [y/N] `)).trim().toLowerCase()
    return answer === 'y' || answer === 'yes'
  }
