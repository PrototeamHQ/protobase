/** The UTF-8 byte order mark, which makes Excel read a CSV file as UTF-8 instead of the system's code page. */
export const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf])

const needsQuotes = /[",\r\n]/

// Text Excel would run as a formula when the file is opened, such as `=HYPERLINK(...)`: a leading apostrophe keeps it
// text (OWASP's advice on CSV injection).
const formulaStart = /^[=+\-@\t\r]/

/** One field as RFC 4180 writes it: in double quotes, its quotes doubled, when it holds a comma, quote or line break. */
export const csvField = (value: string) => (needsQuotes.test(value) ? `"${value.replaceAll('"', '""')}"` : value)

/** Text from a text field, kept from running as a formula in a spreadsheet. */
export const csvTextField = (value: string) => csvField(formulaStart.test(value) ? `'${value}` : value)

/** One record, CRLF-terminated as RFC 4180 has it. */
export const csvLine = (fields: string[]) => `${fields.join(',')}\r\n`
