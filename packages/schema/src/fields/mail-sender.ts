import { z } from 'zod'

export const mailSender = {
  type: 'mail_sender',
  constraints: [],
  build: () => z.email('Expected a mail address').max(254),
} as const
