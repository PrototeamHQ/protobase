import { useState } from 'react'
import type { SignInPolicy, SignInPolicyState } from '@protobase/client'
import { formatDateTime } from '../format'
import { cn } from '../lib/cn'
import { Button } from '../primitives/button'
import { policyRows, ruleLabel, type PolicyRow, type PolicyRule } from './sign-in-policy-labels'

export type SignInPolicyFormProps = {
  /** The saved policy, how it applies, and whether mail is on. */
  state: SignInPolicyState
  /** Called with the edited policy; the page shows `error` when the server refuses it. */
  onSave: (policy: SignInPolicy) => void
  busy?: boolean
  error?: string
  /** Shown after a save went through. */
  notice?: string
}

const RuleChoice = ({ row, value, onChange }: { row: PolicyRow; value: PolicyRule; onChange: (rule: PolicyRule) => void }) => (
  <span role="radiogroup" aria-label={row.label} className="inline-flex h-8 shrink-0 rounded-md bg-muted p-0.5">
    {row.rules.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={option.value === value}
        onClick={() => onChange(option.value)}
        className={cn('rounded px-3 text-xs font-medium transition-colors', option.value === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
      >
        {option.label}
      </button>
    ))}
  </span>
)

// What the row says when the policy applies differently than it reads, or needs something the server lacks.
const rowNote = ({ method }: PolicyRow, draft: SignInPolicy, { mail, effective, policy }: SignInPolicyState) => {
  if (method === 'emailCode' && !mail) return 'Needs mail settings (PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM): off until they are set.'
  if (method === 'password' && !mail && draft.password === 'forbidden') return 'Without mail settings, password sign-in stays on so nobody is locked out.'
  if (method === 'staffAccess' && !mail && draft.staffAccess === 'notify') return 'Needs mail settings (PROTOBASE_SMTP_URL and PROTOBASE_MAIL_FROM): staff cannot sign in until they are set.'
  if (method === 'platformSignIn' && draft.platformSignIn === 'allowed' && (draft.passkey === 'required' || draft.twoFactor === 'required')) {
    return 'Off while passkeys or two-factor authentication are required: it skips the second step.'
  }
  if (draft[method] === policy[method] && effective[method] !== policy[method]) return `Applies as ${ruleLabel(method, effective[method])} for now.`
  return undefined
}

// The rows that apply to this app: staff access with an operator provider, sign-in through the platform with its provider.
const rowsFor = ({ operator, platformSignIn }: SignInPolicyState) =>
  policyRows.flatMap((row) => {
    if (row.method === 'staffAccess' && !operator) return []
    if (row.method === 'platformSignIn') return platformSignIn ? [{ ...row, label: `Sign in with ${platformSignIn} through the platform` }] : []
    return [row]
  })

/**
 * The admin's sign-in policy: for each way to sign in, whether people may use it, must set it up, or cannot use it;
 * when the app has an operator provider, whether its staff may sign in as people; and when the platform adds a sign-in
 * provider, whether people may use it.
 */
export const SignInPolicyForm = ({ state, onSave, busy, error, notice }: SignInPolicyFormProps) => {
  const [draft, setDraft] = useState(state.policy)
  const rows = rowsFor(state)
  const changed = rows.some(({ method }) => draft[method] !== state.policy[method])

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(draft)
      }}
    >
      <ul className="divide-y rounded-lg border bg-background">
        {rows.map((row) => {
          const note = rowNote(row, draft, state)
          return (
            <li key={row.method} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-[13px] font-semibold">{row.label}</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{row.description}</p>
                {note && <p className="mt-1.5 text-xs font-medium text-warning-text">{note}</p>}
              </div>
              <RuleChoice row={row} value={draft[row.method]} onChange={(rule) => setDraft({ ...draft, [row.method]: rule } as SignInPolicy)} />
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
      {notice && !changed && (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success-text">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{state.savedAt ? `Last saved${state.savedBy ? ` by ${state.savedBy}` : ''} on ${formatDateTime(Date.parse(state.savedAt))}.` : 'Never changed: everything is on, nothing is required.'}</p>
        <div className="flex gap-2">
          {changed && <Button onClick={() => setDraft(state.policy)}>Reset</Button>}
          <Button variant="primary" type="submit" loading={busy} disabled={!changed}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
