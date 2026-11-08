// cyrb128: four 32-bit seeds from a text, so nearby texts such as two items' scopes give unrelated streams.
const seedsOf = (text: string) => {
  let [h1, h2, h3, h4] = [1779033703, 3144134277, 1013904242, 2773480762]
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0] as const
}

/**
 * A generator of numbers from 0 up to 1, as `Math.random` gives, that gives the same numbers for the same seed (sfc32,
 * seeded by a hash of the text). Not for secrets.
 */
export const seededRandom = (seed: string) => {
  let [a, b, c, d] = seedsOf(seed)
  return () => {
    a >>>= 0
    b >>>= 0
    c >>>= 0
    d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}
