import Foundation

/**
 * The request headers ProtobaseAuth sends of those page script gives, as Android's AuthHeaders.java keeps them: the
 * string-valued ones, without the Fetch spec's forbidden request header names, which a page's Request never carries.
 * So page script cannot set the cookie, the origin, or the host a shared ingress routes by, nor override the method.
 * A name that is no HTTP token, or a value holding CR, LF or NUL, is dropped too.
 */
enum AuthHeaders {
    private static let forbidden: Set<String> = [
        "accept-charset", "accept-encoding", "access-control-request-headers", "access-control-request-method",
        "connection", "content-length", "cookie", "cookie2", "date", "dnt", "expect", "host", "keep-alive", "origin",
        "referer", "set-cookie", "te", "trailer", "transfer-encoding", "upgrade", "via", "x-http-method",
        "x-http-method-override", "x-method-override",
    ]

    // RFC 9110's tchar.
    private static let token = CharacterSet(charactersIn: "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")

    static func allowed(_ given: [String: Any]?) -> [String: String] {
        var headers: [String: String] = [:]
        for (name, value) in given ?? [:] {
            guard let text = value as? String, !isForbidden(name), !text.contains(where: { "\r\n\0".contains($0) }) else { continue }
            headers[name] = text
        }
        return headers
    }

    private static func isForbidden(_ name: String) -> Bool {
        let lower = name.lowercased()
        let isToken = !name.isEmpty && name.unicodeScalars.allSatisfy { token.contains($0) }
        return !isToken || forbidden.contains(lower) || lower.hasPrefix("proxy-") || lower.hasPrefix("sec-")
    }
}
