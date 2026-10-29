import Foundation

/** The app's own releases URL: https, or http to the device itself, where no one sits on the path; a bare origin and path. */
enum ReleasesUrl {
    private static let loopbackHosts: Set<String> = ["localhost", "127.0.0.1", "::1", "[::1]"]

    static func isOwnSource(_ text: String?) -> Bool {
        guard let text, let parts = URLComponents(string: text), let host = parts.host, !host.isEmpty else { return false }
        if parts.user != nil || parts.password != nil || parts.query != nil || parts.fragment != nil { return false }
        if parts.scheme == "https" { return true }
        return parts.scheme == "http" && loopbackHosts.contains(host)
    }
}
