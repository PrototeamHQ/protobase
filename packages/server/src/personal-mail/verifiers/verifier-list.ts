import type { AddVerifier, SenderAddressVerifier } from './sender-address-verifier'

const idPattern = /^[a-z][a-z0-9_.-]{0,63}$/

/**
 * The verifiers of one app, as its trusted code adds them with `add_verifier` while the app starts: each id once, in
 * lowercase letters, digits, `_`, `.` and `-`, as verifications store it. Once `freeze` is called, as the app's auth is
 * built, `add_verifier` refuses.
 */
export const senderVerifierList = () => {
  const verifiers: SenderAddressVerifier[] = []
  let frozen = false
  const add_verifier: AddVerifier = (verifier) => {
    if (frozen) throw new Error(`add_verifier: "${verifier.id}" comes after the app started; add verifiers while it starts`)
    if (!idPattern.test(verifier.id)) throw new Error(`add_verifier: the id "${verifier.id}" must be lowercase letters, digits, "_", "." or "-", starting with a letter, at most 64 characters`)
    if (verifiers.some(({ id }) => id === verifier.id)) throw new Error(`add_verifier: two verifiers have the id "${verifier.id}"`)
    verifiers.push(verifier)
  }
  return {
    add_verifier,
    freeze: (): readonly SenderAddressVerifier[] => {
      frozen = true
      return [...verifiers]
    },
  }
}
