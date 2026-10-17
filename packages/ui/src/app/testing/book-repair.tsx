import { useState } from 'react'
import { useClient } from '../../data/api-provider'
import { Choices } from '../../primitives/choices'
import { Input } from '../../primitives/input'
import { Textarea } from '../../primitives/textarea'
import { Field } from '../../record-view/field'
import { Section } from '../../record-view/section'
import { Form } from '../create/form'
import { useAppAddress } from '../use-app-address'

const kinds = [
  { value: 'service', label: 'Service', description: 'The whole bike checked: brakes, gears, tyres and chain.' },
  { value: 'flat', label: 'Flat tyre', description: 'A new inner tube, and the tyre checked for what caused it.' },
  { value: 'other', label: 'Something else', description: 'Say what is wrong under Notes.' },
]

/**
 * The bike shop's create page for repairs for stories, as a project would write it in protobase.ui.tsx from the form
 * parts of @protobase/ui: its answers ride in the create address's `values`, so a reload or a link keeps them.
 */
export const BookRepair = () => {
  const { address, go } = useAppAddress()
  const client = useClient()
  const values = address?.kind === 'create' ? (address.values ?? {}) : {}
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>()
  const answer = (patch: Record<string, string>) => go({ kind: 'create', resource: 'repairs', values: { ...values, ...patch } }, { replace: true })
  const kind = kinds.find((option) => option.value === values.kind)

  const submit = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const created = await client.create('repairs', { bike: values.bike, problem: [kind?.label, notes].filter(Boolean).join(': '), status: 'booked' })
      go({ kind: 'record', resource: 'repairs', key: created.record.id as number })
    } catch (failure) {
      setError(failure)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Form submit="Book repair" disabled={!values.bike || !kind} saving={saving} error={error} errorTitle="Not booked" onSubmit={() => void submit()}>
      <Section title="The bike">
        <div className="flex flex-col gap-5">
          <Field label="Bike" required help="Make and model, as on the frame.">
            <Input aria-label="Bike" value={values.bike ?? ''} onChange={(event) => answer({ bike: event.target.value })} />
          </Field>
          <Field label="What it needs" required>
            <Choices name="kind" label="What it needs" options={kinds} value={kind?.value} onChange={(value) => answer({ kind: value })} />
          </Field>
          <Field label="Notes">
            <Textarea aria-label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </Section>
    </Form>
  )
}
