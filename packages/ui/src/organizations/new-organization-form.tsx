import { useId, useRef, useState } from 'react'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../primitives/button'
import { Input } from '../primitives/input'
import { useAction } from './use-action'
import { useOrganizationText } from './organization-word'

/**
 * Names a new organization, its one field; the server makes its slug from the name. The button always answers: an
 * empty name says so by the field, and while the organization is made a second press does nothing.
 */
export const NewOrganizationForm = ({ onCreated, autoFocus = false }: { onCreated: () => void; autoFocus?: boolean }) => {
  const { session } = useAuth()
  const t = useOrganizationText()
  const [name, setName] = useState('')
  const [missing, setMissing] = useState(false)
  const { busy, error, run } = useAction()
  const hint = useId()
  const field = useRef<HTMLInputElement>(null)
  const submit = () => {
    if (busy) return
    if (name.trim() === '') {
      setMissing(true)
      field.current?.focus()
      return
    }
    void run(async () => {
      await session.organizations.create({ name: name.trim() })
      onCreated()
    })
  }
  // Only a missing name is the field's fault; why the server refused, or could not be reached, stays beside it
  const problem = missing ? t('nameNeeded') : error
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={(event) => { event.preventDefault(); submit() }}>
      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5 font-medium">
          {t('organizationName')}
          <Input
            ref={field}
            name="organization"
            autoComplete="organization"
            autoFocus={autoFocus}
            maxLength={200}
            value={name}
            invalid={missing}
            aria-describedby={missing ? hint : undefined}
            onChange={(event) => {
              setName(event.target.value)
              setMissing(false)
            }}
            className="min-h-6"
          />
        </label>
        {problem && <p id={hint} role="alert" className="text-body font-medium text-danger-text">{problem}</p>}
      </div>
      <Button variant="primary" type="submit" loading={busy} busyLabel={t('creating')} className="min-h-10">
        {t('createButton')}
      </Button>
    </form>
  )
}
