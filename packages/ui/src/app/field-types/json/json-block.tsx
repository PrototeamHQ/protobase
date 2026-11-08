import { CodeBlock } from '../../../primitives/code-block'

/** A JSON value written out on several lines. */
export const JsonBlock = ({ value }: { value: unknown }) => <CodeBlock>{JSON.stringify(value, null, 2)}</CodeBlock>
