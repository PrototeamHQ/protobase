import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { SectionError } from '../account-section'
import { PersonalAccessTokensSection } from '../personal-access-tokens-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

const Tokens = () => {
  const { account } = useAuth().session
  const { data: tokens, error, reload } = useAccountData(useCallback(() => account.personalAccessTokens(), [account]), text('couldNotReadAccessTokens'))
  if (!tokens) return <AccountLoading error={error} />
  // The list is read again after every change. A new token reaches its dialog at once, to be copied while the list
  // loads; a failed change, whose answer may have been lost after the server made it, waits for the list before the
  // dialog lets the person try again. A list that could not be read again says so above it.
  return (
    <>
      <SectionError message={error} />
      <PersonalAccessTokensSection
        tokens={tokens}
        onCreate={(input) =>
          account.createPersonalAccessToken(input).then(
            (created) => {
              void reload()
              return created
            },
            async (failure: unknown) => {
              await reload()
              throw failure
            },
          )
        }
        onRevoke={(id) => account.revokePersonalAccessToken(id).finally(reload)}
      />
    </>
  )
}

/** The `PersonalAccessTokens` block: the signed-in person's personal access tokens, hidden when the app has none. */
export const PersonalAccessTokensBlock = () => (useAuth().personalAccessTokens ? <Tokens /> : null)
