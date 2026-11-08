import XCTest
@testable import ProtobaseMobile

final class WorkspaceMessageTests: XCTestCase {
    private let workspace = URL(string: "https://acme.example.com")!

    private func accept(_ body: Any, mainFrame: Bool = true, scheme: String = "https", host: String = "acme.example.com", port: Int = 0) -> WorkspaceMessage? {
        WorkspaceMessage.accept(body, mainFrame: mainFrame, scheme: scheme, host: host, port: port, workspace: workspace)
    }

    func testAcceptsOpenDrawerFromItsOwnMainFrame() {
        XCTAssertEqual(accept("openDrawer"), .openDrawer)
        XCTAssertEqual(accept("openDrawer", port: 443), .openDrawer)
    }

    func testRefusesAFrame() {
        XCTAssertNil(accept("openDrawer", mainFrame: false))
    }

    func testRefusesAnotherOrigin() {
        XCTAssertNil(accept("openDrawer", host: "evil.example.com"))
        XCTAssertNil(accept("openDrawer", scheme: "http"))
        XCTAssertNil(accept("openDrawer", port: 8443))
        XCTAssertNil(accept("openDrawer", scheme: "", host: ""))
    }

    func testRefusesAnythingElse() {
        for body: Any in ["", "OpenDrawer", "register", ["type": "openDrawer"], 1, NSNull()] {
            XCTAssertNil(accept(body), "\(body)")
        }
    }
}
