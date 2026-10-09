const isoDay = /^\d{4}-\d{2}-\d{2}$/

const parseDay = (text: string) => (isoDay.test(text) ? Date.parse(`${text}T00:00:00Z`) : Number.NaN)

export const toIsoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const validateInvoice = (values: { issuedAt: string; dueAt: string; reference: string }) => {
  const errors: { issuedAt?: string; dueAt?: string; reference?: string } = {}
  const issued = parseDay(values.issuedAt)
  const due = parseDay(values.dueAt)
  if (Number.isNaN(issued)) errors.issuedAt = 'Use the format YYYY-MM-DD.'
  if (Number.isNaN(due)) errors.dueAt = 'Use the format YYYY-MM-DD.'
  else if (!Number.isNaN(issued) && due < issued) errors.dueAt = 'The due date cannot be before the issue date.'
  if (values.reference && !/^PO-\d{4,8}$/.test(values.reference)) errors.reference = 'References look like PO-48213.'
  return errors
}
