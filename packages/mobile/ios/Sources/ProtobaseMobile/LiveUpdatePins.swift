import Foundation

/** What the guard takes a release by, read from `plugins.LiveUpdate` once its load check passed. */
struct LiveUpdatePins {
    let releasesUrl: String
    let key: ReleaseKey
    let binary: ReleaseBinary
    let builtInOrder: [Int64]

    /** The pins, or why the guard refuses to load without them. */
    static func make(_ settings: LiveUpdateSettings, appId: String?) -> Result<LiveUpdatePins, LoadRefusal> {
        if !settings.autoBlockRolledBackBundles { return .failure(LoadRefusal("plugins.LiveUpdate.autoBlockRolledBackBundles must be true in a Protobase app")) }
        guard let builtInOrder = ReleaseOrder.parseBuiltIn(settings.builtInOrder) else {
            return .failure(LoadRefusal("plugins.LiveUpdate needs the order of the binary's own files, builtInOrder, in a Protobase app: run protobase mobile again"))
        }
        guard let releasesUrl = settings.releasesUrl, ReleasesUrl.isOwnSource(releasesUrl) else {
            return .failure(LoadRefusal("plugins.LiveUpdate.releasesUrl must be an https URL, or http to the device itself, in a Protobase app"))
        }
        guard let key = ReleaseKey.parse(settings.publicKey) else { return .failure(LoadRefusal("plugins.LiveUpdate.publicKey must be an RSA public key in a Protobase app")) }
        guard let fingerprint = settings.fingerprint, Hex.isHex(fingerprint, count: 16), let shellVersion = settings.shellVersion, ReleaseStatement.isVersion(shellVersion) else {
            return .failure(LoadRefusal("plugins.LiveUpdate needs the binary's fingerprint and shellVersion in a Protobase app: run protobase mobile again"))
        }
        guard let appId, !appId.isEmpty else { return .failure(LoadRefusal("LiveUpdate needs the app's bundle identifier")) }
        let binary = ReleaseBinary(appId: appId, fingerprint: fingerprint, shellVersion: shellVersion)
        return .success(LiveUpdatePins(releasesUrl: releasesUrl, key: key, binary: binary, builtInOrder: builtInOrder))
    }
}

/** Why the guard refuses to load the live updater. */
struct LoadRefusal: Error {
    let reason: String

    init(_ reason: String) {
        self.reason = reason
    }
}
