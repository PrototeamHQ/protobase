import { useState } from 'react'
import type { MailSender } from '@protobase/client'
import { Button } from '../primitives/button'
import { Dialog } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { Switch } from '../primitives/switch'
import { Textarea } from '../primitives/textarea'
import { SectionError } from './account-section'
import { text } from './messages'

/** What the dialog asks: the address, when it is a new one, whether it is shared, its own signature, and if it is the default. */
export type MailSenderInput = { address: string; shared: boolean; signature: string; isDefault: boolean }

type MailSenderDialogProps = {
  /** The address to change; without it, the dialog enters a new one. */
  sender?: MailSender
  busy: boolean
  error?: string
  onSave: (input: MailSenderInput) => void
  onClose: () => void
}

/** Enters a From address, or changes one: whether others in the app may send from it, and its own signature. */
export const MailSenderDialog = ({ sender, busy, error, onSave, onClose }: MailSenderDialogProps) => {
  const [address, setAddress] = useState(sender?.address ?? '')
  const [shared, setShared] = useState(sender?.shared ?? false)
  const [signature, setSignature] = useState(sender?.signature ?? '')
  const [isDefault, setDefault] = useState(sender?.isDefault ?? false)
  const save = () => onSave({ address: address.trim(), shared, signature, isDefault })
  return (
    <Dialog
      title={sender ? sender.address : text('addFromAddress')}
      description={sender ? text('changeFromAddressDescription') : text('addFromAddressDescription')}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{text('cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!address.trim()} onClick={save}>
            {sender ? text('save') : text('addAddress')}
          </Button>
        </>
      }
    >
      {!sender && (
        <label className="flex flex-col gap-1.5 font-medium">
          {text('fromAddress')}
          <Input autoFocus type="email" value={address} maxLength={254} placeholder={text('fromAddressPlaceholder')} onChange={(event) => setAddress(event.target.value)} />
        </label>
      )}
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
        <span>{text('shareFromAddress')}</span>
        <Switch checked={shared} onChange={setShared} label={text('shareFromAddress')} />
      </label>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
        <span>{text('defaultFromAddress')}</span>
        <Switch checked={isDefault} onChange={setDefault} label={text('defaultFromAddress')} />
      </label>
      <label className="mt-3 flex flex-col gap-1.5 font-medium">
        {text('signature')}
        <Textarea value={signature} maxLength={2000} placeholder={text('signaturePlaceholder')} onChange={(event) => setSignature(event.target.value)} />
      </label>
      <SectionError message={error} />
    </Dialog>
  )
}
