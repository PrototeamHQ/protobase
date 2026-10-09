export const stripSpans = <T>(node: T): T => JSON.parse(JSON.stringify(node, (key, value) => (key === 'span' ? undefined : value)))
