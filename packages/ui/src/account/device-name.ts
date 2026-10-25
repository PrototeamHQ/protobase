// In the order to test them: Edge, Opera and Samsung Internet also say Chrome, and Chrome also says Safari.
const browsers: Array<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

// iPads and Android also say Mac OS X and Linux.
const systems: Array<[RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
]

const find = (list: Array<[RegExp, string]>, userAgent: string) => list.find(([pattern]) => pattern.test(userAgent))?.[1]

/** The browser and system a user agent names, such as Chrome and macOS, each `undefined` when it names none we know. */
export const deviceOf = (userAgent: string | undefined) => (userAgent ? { browser: find(browsers, userAgent), system: find(systems, userAgent) } : {})
