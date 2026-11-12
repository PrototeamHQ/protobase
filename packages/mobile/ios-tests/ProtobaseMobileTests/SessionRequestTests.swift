import XCTest
@testable import ProtobaseMobile

/** Answers each request with `StubServer.setCookie` and records what it was sent. */
final class StubServer: URLProtocol {
    nonisolated(unsafe) static var setCookie: String?
    nonisolated(unsafe) static var sentCookies: [String?] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.sentCookies.append(request.value(forHTTPHeaderField: "Cookie"))
        let headers = Self.setCookie.map { ["Set-Cookie": $0] } ?? [:]
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: headers)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

/** A sign-in request takes its cookies from the store and keeps its answer's there, never in a jar a backup carries. */
final class SessionRequestTests: XCTestCase {
    private let keychain = FakeKeychain()
    private lazy var store = SessionStore(keychain: keychain)
    private let api = URL(string: "https://session-request.example.com/api/auth/sign-in/email")!

    override func setUp() {
        StubServer.setCookie = nil
        StubServer.sentCookies = []
    }

    private func send(_ request: URLRequest? = nil) -> Result<(Data?, HTTPURLResponse), Error> {
        let configuration = SessionRequest.configuration()
        configuration.protocolClasses = [StubServer.self]
        var outcome: Result<(Data?, HTTPURLResponse), Error>?
        let done = expectation(description: "answered")
        SessionRequest.send(request ?? URLRequest(url: api), store: store, delegate: nil, configuration: configuration) {
            outcome = $0
            done.fulfill()
        }
        wait(for: [done], timeout: 10)
        return outcome!
    }

    func testTheSessionNeverReachesTheDevicesCookieJar() throws {
        StubServer.setCookie = "session_token=abc; Path=/; HttpOnly; Secure; Max-Age=3600"
        _ = try send().get()
        XCTAssertEqual(HTTPCookieStorage.shared.cookies(for: api) ?? [], [])
        XCTAssertEqual(try store.load().header(for: api), "session_token=abc")
    }

    func testSendsTheKeptCookiesAndNotThePagesOwn() throws {
        StubServer.setCookie = "session_token=abc; Path=/; Secure"
        _ = try send().get()
        StubServer.setCookie = nil
        var request = URLRequest(url: api)
        request.setValue("session_token=planted", forHTTPHeaderField: "Cookie")
        _ = try send(request).get()
        XCTAssertEqual(StubServer.sentCookies, [nil, "session_token=abc"])
    }

    // Security case: signing out leaves no keychain item, and the next request sends no cookie.
    func testSigningOutLeavesNothing() throws {
        StubServer.setCookie = "session_token=abc; Path=/, session_data=xyz; Path=/"
        _ = try send().get()
        StubServer.setCookie = "session_token=; Path=/; Max-Age=0, session_data=; Path=/; Max-Age=0"
        _ = try send().get()
        XCTAssertTrue(keychain.items.isEmpty)
        StubServer.setCookie = nil
        _ = try send().get()
        XCTAssertNil(StubServer.sentCookies.last!)
    }

    // Security case 5.
    func testALockedKeychainFailsWithoutSending() {
        keychain.failure = errSecInteractionNotAllowed
        guard case .failure(let error) = send() else { return XCTFail("a locked keychain answered") }
        XCTAssertEqual((error as? KeychainError)?.status, errSecInteractionNotAllowed)
        XCTAssertEqual(StubServer.sentCookies, [])
    }
}
