/** The invitation email: who invites whom to which organization, the link, and until when it works. */
export const invitationEmail = ({ to, inviter, organization, url, expiresAt }: { to: string; inviter: string; organization: string; url: string; expiresAt: Date }) => ({
  to,
  subject: `Join ${organization}`,
  text: [
    `${inviter} invites you to join ${organization}. To accept, open this link:`,
    '',
    url,
    '',
    `The link works until ${new Date(expiresAt).toUTCString()}.`,
    'If you do not want to join, ignore this email: nothing happens without you.',
    '',
  ].join('\n'),
})
