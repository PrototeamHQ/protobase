import Foundation

/**
 * The cookies ProtobaseAuth keeps for the API, the session among them, as a value: what an answer sets and what a request
 * sends. It takes the place of the device's cookie jar and the WebView's, which iOS saves where a backup carries them;
 * SessionStore keeps this one on the device alone.
 */
struct SessionCookies: Codable, Equatable {
    struct Cookie: Codable, Equatable {
        var name: String
        var value: String
        var domain: String
        var path: String
        var expires: Date?
        var secure: Bool
    }

    static let none = SessionCookies(cookies: [])

    private(set) var cookies: [Cookie]

    var isEmpty: Bool { cookies.isEmpty }

    /**
     * The cookies once `response` to a request for `url` arrived: each Set-Cookie replaces the cookie of its name, domain
     * and path, and one that has expired, such as sign-out's `Max-Age=0`, removes it. `now` defaults to the time after
     * parsing, as `Max-Age=0` expires the moment it is parsed.
     */
    func received(_ response: HTTPURLResponse, for url: URL, now: Date? = nil) -> SessionCookies {
        var fields: [String: String] = [:]
        for case let (name as String, value as String) in response.allHeaderFields { fields[name] = value }
        let parsed = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
        let now = now ?? Date()
        var kept = cookies
        for cookie in parsed {
            kept.removeAll { $0.name == cookie.name && $0.domain == cookie.domain && $0.path == cookie.path }
            kept.append(Cookie(name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path, expires: cookie.expiresDate, secure: cookie.isSecure))
        }
        return SessionCookies(cookies: kept.filter { !$0.hasExpired(now) })
    }

    /** The `Cookie` header for a request to `url`, or nil when no cookie goes there. */
    func header(for url: URL, now: Date = Date()) -> String? {
        let sent = cookies.filter { !$0.hasExpired(now) && $0.matches(url) }
        guard !sent.isEmpty else { return nil }
        return sent.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
    }
}

extension SessionCookies.Cookie {
    func hasExpired(_ now: Date) -> Bool {
        guard let expires else { return false }
        return expires <= now
    }

    /** RFC 6265's domain, path and secure match. */
    func matches(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        if secure && url.scheme?.lowercased() != "https" { return false }
        let domain = domain.lowercased()
        let domainMatch = domain.hasPrefix(".") ? host == String(domain.dropFirst()) || host.hasSuffix(domain) : host == domain
        guard domainMatch else { return false }
        let requestPath = url.path.isEmpty ? "/" : url.path
        if requestPath == path { return true }
        guard requestPath.hasPrefix(path) else { return false }
        return path.hasSuffix("/") || requestPath.dropFirst(path.count).hasPrefix("/")
    }
}
