import XCTest
@testable import ProtobaseMobile

/** Where the session is kept: one keychain item that stays on this device, and signed out whenever it cannot be read. */
final class SessionStoreTests: XCTestCase {
    private let keychain = FakeKeychain()
    private lazy var store = SessionStore(keychain: keychain)
    private let api = URL(string: "https://api.example.com/api/auth/token")!

    private func someCookies() -> SessionCookies {
        SessionCookies.none.received(HTTPURLResponse(url: api, statusCode: 200, httpVersion: nil, headerFields: ["Set-Cookie": "a=1; Path=/"])!, for: api)
    }

    // Security case 2.
    func testTheItemStaysOnThisDeviceAndOutOfICloudKeychain() {
        let query = DeviceKeychain.addQuery(SessionStore.service, Data())
        XCTAssertEqual(query[kSecAttrAccessible as String] as! CFString, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly)
        XCTAssertEqual(query[kSecAttrSynchronizable as String] as? Bool, false)
        XCTAssertEqual(query[kSecClass as String] as! CFString, kSecClassGenericPassword)
    }

    func testKeepsAndLoadsTheCookies() throws {
        try store.save(someCookies())
        XCTAssertEqual(try store.load(), someCookies())
    }

    func testNoItemIsSignedOut() throws {
        XCTAssertEqual(try store.load(), .none)
    }

    // Security case 5.
    func testAnItemThatDoesNotDecodeIsDeletedAndSignedOut() throws {
        keychain.items[SessionStore.service] = Data("not json".utf8)
        XCTAssertEqual(try store.load(), .none)
        XCTAssertNil(keychain.items[SessionStore.service])
    }

    // Security case 5.
    func testAKeychainThatCannotBeReadThrows() {
        keychain.failure = errSecInteractionNotAllowed
        XCTAssertThrowsError(try store.load())
    }

    func testNoCookiesLeftDeletesTheItem() throws {
        try store.save(someCookies())
        try store.save(.none)
        XCTAssertTrue(keychain.items.isEmpty)
    }
}
