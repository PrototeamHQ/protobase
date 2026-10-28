/** Whether the composer may send `message`, its trimmed text: never while busy, and empty text only when allowed, such as for a message of files alone. */
export const canSend = (message: string, { busy, canSendEmpty }: { busy?: boolean; canSendEmpty?: boolean }) => {
  if (busy) return false
  return message !== '' || canSendEmpty === true
}
