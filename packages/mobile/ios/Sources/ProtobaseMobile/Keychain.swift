import Foundation
import Security

/** A keychain status other than found or not found; it names the status alone, never what the item holds. */
struct KeychainError: Error, CustomStringConvertible {
    let status: OSStatus
    var description: String { "the keychain answered OSStatus \(status)" }
}

/** Generic-password items by service: `read` is nil when there is none. */
protocol Keychain {
    func read(_ service: String) throws -> Data?
    func write(_ service: String, _ data: Data) throws
    func delete(_ service: String) throws
}

/**
 * The app's own keychain, whose items stay on this device: readable after the first unlock since it started, never
 * synchronized to iCloud Keychain, and never restored to another device from a backup or a transfer.
 */
struct DeviceKeychain: Keychain {
    static func query(_ service: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrSynchronizable as String: kCFBooleanFalse as Any]
    }

    static func attributes(_ data: Data) -> [String: Any] {
        [kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly, kSecValueData as String: data]
    }

    static func addQuery(_ service: String, _ data: Data) -> [String: Any] {
        query(service).merging(attributes(data)) { $1 }
    }

    func read(_ service: String) throws -> Data? {
        var result: AnyObject?
        let status = SecItemCopyMatching(Self.query(service).merging([kSecReturnData as String: true]) { $1 } as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw KeychainError(status: status) }
        return data
    }

    /**
     * Updates the item in place, its accessibility included, so a failed write keeps the item it had; adds it only when
     * there is none.
     */
    func write(_ service: String, _ data: Data) throws {
        let updated = SecItemUpdate(Self.query(service) as CFDictionary, Self.attributes(data) as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw KeychainError(status: updated) }
        let added = SecItemAdd(Self.addQuery(service, data) as CFDictionary, nil)
        guard added == errSecSuccess else { throw KeychainError(status: added) }
    }

    func delete(_ service: String) throws {
        let status = SecItemDelete(Self.query(service) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }
}
