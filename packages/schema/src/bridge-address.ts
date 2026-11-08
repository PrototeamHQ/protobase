/** The name of a bridge token in the query of the bridge's socket address. */
export const bridgeTokenParam = 'token'

/** The address of the socket a bridge token opens, below the bridge function's own path, such as `/api/functions/console`. */
export const bridgeSocketPath = (functionPath: string, token: string) => `${functionPath}?${new URLSearchParams({ [bridgeTokenParam]: token })}`
