import { useCallback } from 'react'
import { useAuth } from '../../auth/auth-provider'
import { PersonalAccessTokensSection } from '../personal-access-tokens-section'
import { text } from '../messages'
import { AccountLoading } from './account-loading'
import { useAccountData } from './use-account-data'

const Tokens = () => {
  const { account } = useAuth().session
  const { data: tokens, error, reload } = useAccountData(useCallback(() => account.personalAccessTokens(), [account]), text('couldNotReadAccessTokens'))
  if (!tokens) return <AccountLoading error={error} />
  return (
    <PersonalAccessTokensSection
      tokens={tokens}
      onCreate={async (input) => {
        const created = await account.createPersonalAccessToken(input)
        reload()
        return created
      }}
      onRevoke={(id) => account.revokePersonalAccessToken(id).then(reload)}
    />
  )
}

/** The `PersonalAccessTokens` block: the signed-in person's personal access tokens, hidden when the app has none. */
export const PersonalAccessTokensBlock = () => (useAuth().personalAccessTokens ? <Tokens /> : null)
