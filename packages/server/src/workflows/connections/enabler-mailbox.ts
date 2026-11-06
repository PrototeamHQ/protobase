import type { PluginMail } from '@protobase/workflows/plugin'
import type { Mailer } from '../../mail/smtp-mailer'
import { PersonalMailError } from '../../personal-mail/personal-mail-error'

/**
 * The step context's `mailbox`: each message goes out from the own mailbox of the person who turned the run's version
 * on, signed in as themselves, as `enablerOf` reads them afresh; nobody (a version an outside app turned on, a workflow
 * turned off, or someone who may no longer change it) sends nothing and fails `not_linked`. A job's own code gets no
 * such mailer: only this consent lets mail leave someone's mailbox without their own request.
 */
export const enablerMailbox = (enablerOf: () => Promise<string | null>, personalMailer: (userId: string) => Mailer): PluginMail => ({
  send: async (message) => {
    const enabledBy = await enablerOf()
    if (!enabledBy) throw new PersonalMailError('not_linked')
    await personalMailer(enabledBy).send(message)
  },
})
