import XCTest
@testable import ProtobaseMobile

final class ExternalUrlTests: XCTestCase {
    func testOpensAbsoluteHttpAndHttps() {
        for url in ["https://example.com/a?b=1#c", "http://example.com:8080/", "HTTPS://Example.com/"] {
            XCTAssertNotNil(ExternalUrl.allowed(url), url)
        }
    }

    func testRefusesEverythingElse() {
        for url in [nil, "", "javascript:alert(1)", "data:text/html,<b>x</b>", "/relative", "//example.com/a", "https:///a", "ftp://example.com/",
                    "https://example.com/a b", "https://example.com/\u{0}", "https://example.com/\n", "https://example.com/" + String(repeating: "a", count: 2048)] {
            XCTAssertNil(ExternalUrl.allowed(url), url ?? "nil")
        }
    }
}
