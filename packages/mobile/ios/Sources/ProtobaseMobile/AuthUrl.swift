import Foundation

/** The sign-in addresses ProtobaseAuth calls: `<apiOrigin>/api/auth/...`, as Android's AuthUrl.java allows them. */
enum AuthUrl {
    /** Where Better Auth's endpoints are served, as packages/schema/src/auth-base-path.ts names it. */
    static let authBasePath = "/api/auth"

    private struct Parts {
        let scheme: String
        let host: String
        let port: Int
        let path: String
        let hasUser: Bool
    }

    private static func parse(_ text: String) -> Parts? {
        guard let url = URL(string: text), let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let scheme = (parts.scheme ?? "").lowercased()
        guard scheme == "http" || scheme == "https", let host = parts.percentEncodedHost, !host.isEmpty else { return nil }
        let port = parts.port ?? (scheme == "https" ? 443 : 80)
        let hasUser = parts.percentEncodedUser != nil || parts.percentEncodedPassword != nil
        return Parts(scheme: scheme, host: host.lowercased(), port: port, path: parts.percentEncodedPath, hasUser: hasUser)
    }

    /** The URL to send when `text` is allowed, so the URL checked is the URL sent; `nil` otherwise. */
    static func allowed(_ text: String, apiOrigin: String) -> URL? {
        guard let origin = parse(apiOrigin), let target = parse(text), origin.path.isEmpty, !target.hasUser else { return nil }
        guard target.scheme == origin.scheme, target.host == origin.host, target.port == origin.port else { return nil }
        let path = target.path
        guard path.hasPrefix(authBasePath + "/"), !path.contains("\\") else { return nil }
        let lower = path.lowercased()
        guard !["%2e", "%2f", "%5c"].contains(where: { lower.contains($0) }) else { return nil }
        guard !path.split(separator: "/", omittingEmptySubsequences: false).contains(where: { $0 == "." || $0 == ".." }) else { return nil }
        return URL(string: text)
    }
}
