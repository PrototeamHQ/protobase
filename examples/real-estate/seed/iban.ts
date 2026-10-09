import { banks } from './data/names'
import { int, pick, type Rand } from './rng'

// ISO 13616 check digits: the account with "NL00" moved to the end, letters as numbers, mod 97.
const checkDigits = (bban: string) => {
  const digits = `${bban}NL00`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55))
  const remainder = digits.split('').reduce((rest, digit) => (rest * 10 + Number(digit)) % 97, 0)
  return String(98 - remainder).padStart(2, '0')
}

/** A Dutch IBAN with valid check digits: NLkk BANK 0123456789. */
export const iban = (rand: Rand) => {
  const bban = `${pick(rand, banks)}${String(int(rand, 100_000_000, 999_999_999)).padStart(10, '0')}`
  return `NL${checkDigits(bban)}${bban}`
}
