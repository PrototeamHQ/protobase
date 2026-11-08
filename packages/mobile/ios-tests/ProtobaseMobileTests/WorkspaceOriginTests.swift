import XCTest
@testable import ProtobaseMobile

final class WorkspaceOriginTests: XCTestCase {
    func testKeepsAnHttpsOrLoopbackOriginInOneForm() {
        let cases = [
            "https://acme.example.com": "https://acme.example.com",
            "HTTPS://Acme.Example.com/": "https://acme.example.com",
            "https://acme.example.com:443": "https://acme.example.com",
            "https://acme.example.com:8443": "https://acme.example.com:8443",
            "http://localhost:3000": "http://localhost:3000",
            "http://127.0.0.1": "http://127.0.0.1",
        ]
        for (text, origin) in cases {
            XCTAssertEqual(WorkspaceOrigin.parse(text)?.absoluteString, origin, text)
        }
    }

    func testRefusesAnythingButAnOrigin() {
        for text in ["", "acme.example.com", "http://acme.example.com", "http://localhost.example.com", "ftp://acme.example.com", "file:///tmp",
                     "https://user@acme.example.com", "https://u:p@acme.example.com", "https://acme.example.com/app", "https://acme.example.com/?a=1",
                     "https://acme.example.com/#x", "https:///", "javascript:alert(1)"] {
            XCTAssertNil(WorkspaceOrigin.parse(text), text)
        }
    }
}
