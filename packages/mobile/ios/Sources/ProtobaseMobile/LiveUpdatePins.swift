import Foundation

/**
 * What the guard takes a release by, whichever target swaps it in: read from `plugins.LiveUpdate` once its load check
 * passed, or from a host's settings (HostedReleaseSettings).
 */
struct LiveUpdatePins {
    let releasesUrl: String
    let key: ReleaseKey
    let binary: ReleaseBinary
    let builtInOrder: [Int64]

    /** The pins of a Protobase app's binary, or why the guard refuses to load without them. */
    static func make(_ settings: LiveUpdateSettings, appId: String?) -> Result<LiveUpdatePins, LoadRefusal> {
        if !settings.autoBlockRolledBackBundles { return .failure(LoadRefusal("plugins.LiveUpdate.autoBlockRolledBackBundles must be true in a Protobase app")) }
        return make(releasesUrl: settings.releasesUrl, publicKey: settings.publicKey, fingerprint: settings.fingerprint, shellVersion: settings.shellVersion, builtInOrder: settings.builtInOrder, appId: appId)
    }

    /** The pins, whichever target swaps releases in, or why there are none. */
    static func make(releasesUrl: String?, publicKey: String?, fingerprint: String?, shellVersion: String?, builtInOrder: String?, appId: String?) -> Result<LiveUpdatePins, LoadRefusal> {
        guard let builtInOrder = ReleaseOrder.parseBuiltIn(builtInOrder) else {
            return .failure(LoadRefusal("plugins.LiveUpdate needs the order of the binary's own files, builtInOrder, in a Protobase app: run protobase mobile again"))
        }
        guard let releasesUrl, ReleasesUrl.isOwnSource(releasesUrl) else {
            return .failure(LoadRefusal("plugins.LiveUpdate.releasesUrl must be an https URL, or http to the device itself, in a Protobase app"))
        }
        guard let key = ReleaseKey.parse(publicKey) else { return .failure(LoadRefusal("plugins.LiveUpdate.publicKey must be an RSA public key in a Protobase app")) }
        guard let fingerprint, Hex.isHex(fingerprint, count: 16), let shellVersion, ReleaseStatement.isVersion(shellVersion) else {
            return .failure(LoadRefusal("plugins.LiveUpdate needs the binary's fingerprint and shellVersion in a Protobase app: run protobase mobile again"))
        }
        guard let appId, !appId.isEmpty else { return .failure(LoadRefusal("LiveUpdate needs the app's bundle identifier")) }
        let binary = ReleaseBinary(appId: appId, fingerprint: fingerprint, shellVersion: shellVersion)
        return .success(LiveUpdatePins(releasesUrl: releasesUrl, key: key, binary: binary, builtInOrder: builtInOrder))
    }
}

/** Why the guard refuses to load the live updater. */
public struct LoadRefusal: Error {
    public let reason: String

    init(_ reason: String) {
        self.reason = reason
    }
}
