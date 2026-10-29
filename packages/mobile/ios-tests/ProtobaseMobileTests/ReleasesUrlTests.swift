import XCTest
@testable import ProtobaseMobile

final class ReleasesUrlTests: XCTestCase {
    func testAcceptsHttpsAndLoopbackHttp() {
        for url in ["https://api.example.com/api/mobile/releases", "http://localhost:3000/r", "http://127.0.0.1/r", "http://[::1]:3000/r"] {
            XCTAssertTrue(ReleasesUrl.isOwnSource(url), url)
        }
    }

    func testRefusesEverythingElse() {
        for url in [nil, "", "http://api.example.com/r", "http://localhost.example.com/r", "https://user@api.example.com/r", "https://u:p@api.example.com/r",
                    "https://api.example.com/r?x=1", "https://api.example.com/r#x", "file:///tmp/r", "https:///r", "/r", "ftp://api.example.com/r"] {
            XCTAssertFalse(ReleasesUrl.isOwnSource(url), url ?? "nil")
        }
    }
}
