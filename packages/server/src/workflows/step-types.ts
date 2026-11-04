import type { TaskHandlers } from '@protobase/workflows'
import type { Deps } from '../deps'
import type { Mailer } from '../mail/mail-message'
import { httpStep } from './http-step'
import { mailStep } from './mail-step'
import { pieceStep } from './piece-step'
import { recordsSteps, type SaverRoles } from './records-step'

/** The step types a Task names as its `Resource`, as the language report lists them. */
export const stepTypeNames = ['app:http', 'app:records.create', 'app:records.update', 'app:records.get', 'app:records.list', 'app:mail.send', 'app:piece'] as const

export type StepTypesInput = { deps: () => Deps; schema: string; roles: SaverRoles; allowPrivateAddresses: boolean }

/** The step types of one segment, which sends mail with the mailer of the job that runs it. */
export const stepTypes = ({ deps, schema, roles, allowPrivateAddresses }: StepTypesInput, mail: Mailer | undefined): TaskHandlers => {
  const files = () => deps().files
  return {
    'app:http': httpStep({ allowPrivateAddresses, files }),
    ...recordsSteps({ deps, schema, roles }),
    'app:mail.send': mailStep(() => mail, files),
    'app:piece': pieceStep,
  }
}
