import XCTest
@testable import ProtobaseMobile

final class SameOriginTests: XCTestCase {
    private let app = URL(string: "https://acme.example.com")!

    func testMatchesTheSameSchemeHostAndPort() {
        XCTAssertTrue(SameOrigin.matches(scheme: "https", host: "acme.example.com", port: 0, app))
        XCTAssertTrue(SameOrigin.matches(scheme: "HTTPS", host: "ACME.example.com", port: 443, app))
        XCTAssertTrue(SameOrigin.matches(URL(string: "https://acme.example.com:443/a?b#c")!, app))
        XCTAssertTrue(SameOrigin.matches(scheme: "http", host: "localhost", port: 8080, URL(string: "http://localhost:8080")!))
    }

    func testRefusesAnotherSchemeHostOrPort() {
        XCTAssertFalse(SameOrigin.matches(scheme: "http", host: "acme.example.com", port: 0, app))
        XCTAssertFalse(SameOrigin.matches(scheme: "https", host: "evil.example.com", port: 0, app))
        XCTAssertFalse(SameOrigin.matches(scheme: "https", host: "acme.example.com.evil.com", port: 0, app))
        XCTAssertFalse(SameOrigin.matches(scheme: "https", host: "acme.example.com", port: 8443, app))
        // An opaque origin, such as a sandboxed page's, has no scheme or host.
        XCTAssertFalse(SameOrigin.matches(scheme: "", host: "", port: 0, app))
        XCTAssertFalse(SameOrigin.matches(URL(string: "http://127.0.0.1:8081")!, URL(string: "http://127.0.0.1:8080")!))
    }
}
