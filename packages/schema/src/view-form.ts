import { formNamePattern } from './form-address'
import type { FormModel } from './model'
import type { Ref } from './refs'

/** How many submissions one client may send a form per minute, unless the form says: as many as sign-in allows. */
export const defaultPerMinute = 5

/** What `.form(...)` takes. */
export type FormInput = {
  /** Its address in the app, `/-/forms/<name>`: lowercase letters, digits, `-` and `_`, unique across the app. */
  name: string
  /** The page's heading; the view's singular name when omitted. */
  title?: string
  /** The fields a visitor fills in, in order: plain fields the `anonymous` role may create. */
  fields: Ref[]
  /** What the page shows once the record is created. */
  thanks: string
  /** How many submissions one client may send per minute; default 5. */
  perMinute?: number
}

export const formModel = (input: FormInput): FormModel => {
  const { name, title, fields, thanks } = input
  if (!formNamePattern.test(name)) throw new Error(`A form's name goes in its address, so it takes lowercase letters, digits, - and _, not "${name}"`)
  if (fields.length === 0) throw new Error(`Form "${name}" has no fields`)
  const names = fields.map((field) => field.name)
  const repeated = names.find((field, index) => names.indexOf(field) !== index)
  if (repeated !== undefined) throw new Error(`Form "${name}" lists the field "${repeated}" twice`)
  if (thanks.trim() === '') throw new Error(`Form "${name}" needs a thanks text, shown once a visitor sends it`)
  if (title !== undefined && title.trim() === '') throw new Error(`Form "${name}" has an empty title; leave it out for the view's name`)
  const perMinute = input.perMinute ?? defaultPerMinute
  if (!Number.isInteger(perMinute) || perMinute < 1) throw new Error(`Form "${name}" takes perMinute as a positive whole number, not ${perMinute}`)
  return { name, ...(title !== undefined && { title }), fields: names, thanks, perMinute }
}
