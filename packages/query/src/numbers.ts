/** Driver values for bigint/numeric columns arrive as number, bigint or string. */
export const toNumber = (value: unknown) => Number(value)
