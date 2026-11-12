import Foundation

/**
 * Where ProtobaseAuth keeps its cookies between launches: one keychain item that stays on this device, so no backup
 * and no new iPhone holds the session. A keychain that cannot be read throws, and the sign-in call fails as signed out.
 */
struct SessionStore {
    static let service = "net.protobase.mobile.session"

    let keychain: Keychain

    /** The kept cookies; none when there is no item, and an item that does not decode is deleted and counts as none. */
    func load() throws -> SessionCookies {
        guard let data = try keychain.read(Self.service) else { return .none }
        guard let cookies = try? JSONDecoder().decode(SessionCookies.self, from: data) else {
            try keychain.delete(Self.service)
            return .none
        }
        return cookies
    }

    /** Keeps `cookies`, deleting the item once none are left, as after signing out. */
    func save(_ cookies: SessionCookies) throws {
        guard !cookies.isEmpty else {
            try keychain.delete(Self.service)
            return
        }
        try keychain.write(Self.service, try JSONEncoder().encode(cookies))
    }
}
