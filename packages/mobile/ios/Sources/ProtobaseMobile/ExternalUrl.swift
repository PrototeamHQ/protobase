import Foundation

/**
 * Whether ProtobaseExternal may open a URL, as the server's tapUrl and the shell check it: at most 2048 characters with
 * no whitespace or control character, parsed as an absolute `http` or `https` URL with a host.
 */
enum ExternalUrl {
    private static let refused = CharacterSet.whitespacesAndNewlines.union(.controlCharacters).union(.illegalCharacters)

    static func allowed(_ text: String?) -> URL? {
        guard let text, text.count <= 2048, text.unicodeScalars.allSatisfy({ !refused.contains($0) }) else { return nil }
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else { return nil }
        guard let host = url.host, !host.isEmpty else { return nil }
        return url
    }
}
