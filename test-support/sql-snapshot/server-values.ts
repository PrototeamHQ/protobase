import { createServerTimes, decodeTimes } from './server-times'
import { createServerUuids, decodeUuids } from './server-uuids'

// What Postgres makes up itself, its clock's times and its random UUIDs, kept as tokens in a recording so a recording
// changes only when the answers do.

/** Replaces each token in `text` with the fixed value the test sees for it. */
export const decodeServerValues = (text: string) => decodeUuids(decodeTimes(text))

/** The made-up values of one recording: tokens in the file, and the real values Postgres must get back. */
export const createServerValues = () => {
  const encoders = [createServerTimes(), createServerUuids()]
  return {
    /** Takes in what Postgres returned and gives what the file keeps of each text. */
    encodeResult: (texts: string[]) => {
      const steps = encoders.map((encoder) => encoder.encodeResult(texts))
      return (text: string) => steps.reduce((kept, step) => step(kept), text)
    },
    /** A param the test sent, as Postgres must get it (`real`) and as the file keeps it (`kept`). */
    encodeParam: (text: string) => ({
      real: encoders.reduce((value, encoder) => encoder.toReal(value), text),
      kept: encoders.reduce((value, encoder) => encoder.toKept(value), text),
    }),
  }
}
