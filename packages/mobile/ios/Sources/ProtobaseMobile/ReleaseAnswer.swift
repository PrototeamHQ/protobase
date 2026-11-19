import Foundation

/**
 * The server's answer to `GET /api/mobile/release` (the shell's release-answer.ts): the release the binary should run,
 * nil when none runs on it, and whether the update is required. Fields a later server adds are ignored.
 */
struct ReleaseAnswer: Equatable {
    let bundleId: String?
    let required: Bool

    /** The answer `data` holds, or nil for any other body, which changes nothing. */
    static func parse(_ data: Data) -> ReleaseAnswer? {
        guard let body = Json.parse(data) as? [String: Any], let flag = body["required"] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID() else { return nil }
        let required = flag.boolValue
        switch body["bundleId"] {
        case is NSNull:
            return ReleaseAnswer(bundleId: nil, required: required)
        case let id as String where BundlesFolder.isBundleIdShape(id):
            return ReleaseAnswer(bundleId: id, required: required)
        default:
            return nil
        }
    }
}
