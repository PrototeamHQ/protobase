import Foundation

/**
 * A release's statement (`releaseStatementFile` in @protobase/schema): what binds its manifest to its order, the app,
 * the binary and the shell, signed with the app's key. Only bytes the signature covers are parsed for what they say.
 */
struct ReleaseStatement {
    static let file = "protobase-release.json"
    static let maxBytes = 64 * 1024
    private static let context = Data("protobase-mobile-release\n".utf8)
    private static let keys: Set<String> = ["manifest", "order", "appId", "fingerprint", "shellVersion"]
    private static let version = try! NSRegularExpression(pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$")
    private static let maxOrder = 8

    let manifest: String
    let order: [Int64]
    let appId: String
    let fingerprint: String
    let shellVersion: String

    /**
     * The statement `file` holds, when it is the one bundle `bundleId` names, the first 16 hex of the sha256 of its bytes
     * and of `key`'s SPKI DER, as `composeRelease` derives it, and `key` signed what it says.
     */
    static func verify(_ file: Data, bundleId: String, key: ReleaseKey) throws -> ReleaseStatement {
        if file.count > maxBytes { throw BundleRefused("its statement is too large") }
        if Sha256.of(file, key.spki).prefix(16) != bundleId { throw BundleRefused("its id does not name its statement and the app's key") }
        guard let outer = Json.parse(file) as? [String: Any], let payloadHex = outer["payload"] as? String, let signatureHex = outer["signature"] as? String else {
            throw BundleRefused("its statement is malformed")
        }
        let payload = try Hex.decode(payloadHex, "its statement's payload")
        let signature = try Hex.decode(signatureHex, "its statement's signature")
        if !key.signed(context + payload, signature) { throw BundleRefused("its statement is not signed with the app's key") }
        guard let fields = Json.parse(payload) as? [String: Any] else { throw BundleRefused("its statement says nothing it can read") }
        return try parse(fields)
    }

    private static func parse(_ payload: [String: Any]) throws -> ReleaseStatement {
        if Set(payload.keys) != keys { throw BundleRefused("its statement does not say exactly what binds it") }
        guard let manifest = payload["manifest"] as? String, Hex.isHex(manifest, count: 64) else { throw BundleRefused("its statement names no manifest hash") }
        guard let appId = payload["appId"] as? String, !appId.isEmpty else { throw BundleRefused("its statement names no app") }
        guard let fingerprint = payload["fingerprint"] as? String, Hex.isHex(fingerprint, count: 16) else { throw BundleRefused("its statement names no fingerprint") }
        guard let shellVersion = payload["shellVersion"] as? String, isVersion(shellVersion) else { throw BundleRefused("its statement names no shell version") }
        guard let parts = payload["order"] as? [Any], (1...maxOrder).contains(parts.count) else { throw BundleRefused("its statement names no order") }
        let order = parts.map(Json.integer)
        guard order.allSatisfy({ ($0 ?? -1) >= 0 }) else { throw BundleRefused("its statement names no order") }
        return ReleaseStatement(manifest: manifest, order: order.map { $0! }, appId: appId, fingerprint: fingerprint, shellVersion: shellVersion)
    }

    static func isVersion(_ text: String?) -> Bool {
        guard let text else { return false }
        return version.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    /** The major and minor of an x.y.z version `isVersion` accepted. */
    static func majorMinor(_ version: String) -> (Int64, Int64) {
        let parts = version.split(separator: ".").map { Int64($0) ?? -1 }
        return (parts[0], parts[1])
    }
}
