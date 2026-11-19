/**
 * What a host's binary takes releases by, as a Protobase app's carries them in `plugins.LiveUpdate`: the origin of the
 * API that serves its releases, the release signing key's public key (`mobile.publicKey`), its native fingerprint, the
 * Protobase version of the shell it ships and the order of those files.
 */
public struct HostedReleaseSettings {
    public var apiOrigin: String
    public var publicKey: String
    public var fingerprint: String
    public var shellVersion: String
    public var builtInOrder: String

    public init(apiOrigin: String, publicKey: String, fingerprint: String, shellVersion: String, builtInOrder: String) {
        self.apiOrigin = apiOrigin
        self.publicKey = publicKey
        self.fingerprint = fingerprint
        self.shellVersion = shellVersion
        self.builtInOrder = builtInOrder
    }

    /** Where the API serves its releases' files. */
    var releasesUrl: String { apiOrigin + "/api/mobile/releases" }
}
