import Foundation
import WebKit

/**
 * Whether a frame's security origin, or a URL, is the origin of `url`: the same scheme and host, ignoring case, and the
 * same port, an absent or zero port counting as the scheme's default. PageScriptFilter checks an app's own page with it,
 * and a workspace view its page and every navigation.
 */
enum SameOrigin {
    /** Whether `url` is of the frame's security origin. */
    static func matches(_ origin: WKSecurityOrigin, _ url: URL) -> Bool {
        matches(scheme: origin.protocol, host: origin.host, port: origin.port, url)
    }

    /** Whether `url` is of the origin of `other`. */
    static func matches(_ other: URL, _ url: URL) -> Bool {
        matches(scheme: other.scheme ?? "", host: other.host ?? "", port: other.port ?? 0, url)
    }

    /** Whether `url` has this scheme and host, ignoring case, and this port, an absent one counting as the default. */
    static func matches(scheme: String, host: String, port: Int, _ url: URL) -> Bool {
        let urlScheme = (url.scheme ?? "").lowercased()
        let urlPort = url.port ?? defaultPort(urlScheme)
        let originPort = port == 0 ? defaultPort(scheme.lowercased()) : port
        return scheme.lowercased() == urlScheme && host.lowercased() == (url.host ?? "").lowercased() && originPort == urlPort
    }

    /** The port a URL of `scheme` uses without one: 80 for http, 443 for https, -1 for any other. */
    static func defaultPort(_ scheme: String) -> Int {
        switch scheme {
        case "http": return 80
        case "https": return 443
        default: return 0
        }
    }
}
