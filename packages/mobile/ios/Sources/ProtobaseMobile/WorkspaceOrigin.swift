import Foundation

/**
 * A workspace's address as the shell keeps it: an `https` origin, or an `http` one on a loopback host (`localhost`,
 * `127.0.0.1`), the hosts a browser counts as a secure context. Written as `scheme://host[:port]`, scheme and host in
 * lower case and a default port left out. Refused: any other scheme or host, credentials, a path other than `/`, a
 * query or a fragment.
 */
enum WorkspaceOrigin {
    private static let loopbackHosts: Set<String> = ["localhost", "127.0.0.1"]

    static func parse(_ text: String) -> URL? {
        guard let parts = URLComponents(string: text), let scheme = parts.scheme?.lowercased(), let host = parts.host?.lowercased(), !host.isEmpty else { return nil }
        guard scheme == "https" || (scheme == "http" && loopbackHosts.contains(host)) else { return nil }
        guard parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil, parts.path == "" || parts.path == "/" else { return nil }
        let port = parts.port.flatMap { $0 == SameOrigin.defaultPort(scheme) ? nil : $0 }
        return URL(string: "\(scheme)://\(host)\(port.map { ":\($0)" } ?? "")")
    }
}
