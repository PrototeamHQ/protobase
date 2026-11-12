import Foundation
@testable import ProtobaseMobile

/** A keychain in memory, which answers `failure` instead when it is set, as a locked or broken keychain does. */
final class FakeKeychain: Keychain {
    var items: [String: Data] = [:]
    var failure: OSStatus?

    func read(_ service: String) throws -> Data? {
        if let failure { throw KeychainError(status: failure) }
        return items[service]
    }

    func write(_ service: String, _ data: Data) throws {
        if let failure { throw KeychainError(status: failure) }
        items[service] = data
    }

    func delete(_ service: String) throws {
        if let failure { throw KeychainError(status: failure) }
        items[service] = nil
    }
}
