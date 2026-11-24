import type { SectionContractions } from './trial'

/** The way through for a change that breaks older code which no path of Protobase's writes. */
export const breaksOlderCodeHint =
  "To make it anyway, write it by hand with `protobase migration --custom <name>` and put `-- protobase:breaks-older-code` among its `-- protobase:` lines: the version before then refuses to start on the database, and rolling back to it is blocked"

/** The refusal of a migration that would take from older code what `found` names, by section. */
export const olderCodeRefusal = (found: readonly SectionContractions[]) =>
  `The migration would break the code still running while it deploys, and the version before it once rolled back: ${found.map(({ name, found: lines }) => `${name} ${lines.join(', ')}`).join('; ')}. ${breaksOlderCodeHint}.`

/** The lines under the intro of a file whose own paths' steps take what `found` names from older code, each by its section. */
export const breaksOlderCodeNote = (found: readonly string[]) =>
  `-- It breaks older code: once it is applied, the version before refuses to start on the database, and rolling back to it is blocked.\n${found.map((line) => `-- ${line}.`).join('\n')}\n`
