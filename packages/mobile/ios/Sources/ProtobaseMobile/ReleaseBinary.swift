/**
 * This binary: its app id, its native fingerprint and the Protobase version of its shell, from the app's bundle and
 * capacitor.config.json, beyond page script and a live update. It takes a release only for itself.
 */
struct ReleaseBinary {
    let appId: String
    let fingerprint: String
    let shellVersion: String

    /**
     * Refuses a release for another app or fingerprint, or of a server whose API this shell does not work with: the same
     * major, and below 1.0 the same minor, as the server's `shellUpdateRequired` says.
     */
    func accept(_ statement: ReleaseStatement) throws {
        if statement.appId != appId { throw BundleRefused("it is a release of another app") }
        if statement.fingerprint != fingerprint { throw BundleRefused("it is a release for another binary") }
        let own = ReleaseStatement.majorMinor(shellVersion)
        let server = ReleaseStatement.majorMinor(statement.shellVersion)
        if own.0 != server.0 || (server.0 == 0 && own.1 != server.1) { throw BundleRefused("it is a release for another shell version") }
    }
}
