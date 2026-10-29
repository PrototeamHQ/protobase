/**
 * The native fingerprint the iOS or Android binary names in its user agent, `ProtobaseNative/<fingerprint>`, which
 * `protobase mobile` writes beside the app's files: `undefined` without one.
 */
export const nativeFingerprintOf = (userAgent: string) => /(?:^|\s)ProtobaseNative\/([0-9a-f]{16})(?:\s|$)/.exec(userAgent)?.[1]
