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
  // The list is read again after every change, a failed one too, whose answer may have been lost after the server
  // made it, and the dialog stays busy until it is in; a list that could not be read again says so above it.
  return (
    <>
      <SectionError message={error} />
      <PersonalAccessTokensSection
        tokens={tokens}
        onCreate={(input) => account.createPersonalAccessToken(input).finally(reload)}
        onRevoke={(id) => account.revokePersonalAccessToken(id).finally(reload)}
      />
    </>
  )
}

/** The `PersonalAccessTokens` block: the signed-in person's personal access tokens, hidden when the app has none. */
export const PersonalAccessTokensBlock = () => (useAuth().personalAccessTokens ? <Tokens /> : null)
