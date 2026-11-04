import { workflowStepTypes, type WorkflowStepType } from '@protobase/schema/internal'
import type { TaskHandlers } from '@protobase/workflows'
import type { Deps } from '../deps'
import type { Mailer } from '../mail/mail-message'
import { httpStep } from './http-step'
import { mailStep } from './mail-step'
import { pieceStep } from './piece-step'
import { recordsSteps, type SaverRoles } from './records-step'

/** The step types a Task names as its `Resource`, as the editor offers them. */
export const stepTypeNames = Object.keys(workflowStepTypes) as WorkflowStepType[]

export type StepTypesInput = { deps: () => Deps; schema: string; roles: SaverRoles; allowPrivateAddresses: boolean }

/** The step types of one segment, which sends mail with the mailer of the job that runs it. */
export const stepTypes = ({ deps, schema, roles, allowPrivateAddresses }: StepTypesInput, mail: Mailer | undefined): TaskHandlers & Record<WorkflowStepType, unknown> => {
  const files = () => deps().files
  return {
    'app:http': httpStep({ allowPrivateAddresses, files }),
    ...recordsSteps({ deps, schema, roles }),
    'app:mail.send': mailStep(() => mail, files),
    'app:piece': pieceStep,
  }
}
