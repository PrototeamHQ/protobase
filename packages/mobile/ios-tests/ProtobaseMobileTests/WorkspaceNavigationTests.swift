import XCTest
@testable import ProtobaseMobile

final class WorkspaceNavigationTests: XCTestCase {
    private let workspace = URL(string: "https://acme.example.com")!

    private func decide(_ url: String, mainFrame: Bool = true, method: String = "GET") -> WorkspaceNavigation.Decision {
        WorkspaceNavigation.decide(URL(string: url)!, mainFrame: mainFrame, method: method, workspace: workspace)
    }

    func testLoadsItsOwnOriginInTheMainFrame() {
        XCTAssertEqual(decide("https://acme.example.com/"), .load)
        XCTAssertEqual(decide("https://ACME.example.com:443/tasks/1?tab=a#b"), .load)
        XCTAssertEqual(decide("https://acme.example.com/sign-in", method: "POST"), .load)
    }

    func testSendsAnotherWebOriginToTheSystemBrowser() {
        for url in ["https://central.example.com/landing", "https://example.org/", "http://acme.example.com/", "https://acme.example.com:8443/",
                    "https://acme.example.com.evil.com/"] {
            XCTAssertEqual(decide(url), .openExternally, url)
        }
    }

    func testRefusesWhatTheSystemBrowserCannotTake() {
        XCTAssertEqual(decide("https://example.org/form", method: "POST"), .refuse)
        XCTAssertEqual(decide("https://example.org/" + String(repeating: "a", count: 2048)), .refuse)
        for url in ["about:blank", "file:///etc/hosts", "data:text/html,hi", "blob:https://acme.example.com/1", "tel:123", "mailto:a@b.c", "intent://x", "myapp://x", "javascript:alert(1)"] {
            XCTAssertEqual(decide(url), .refuse, url)
        }
    }

    func testLoadsFramesAsABrowserDoes() {
        for url in ["https://acme.example.com/child", "https://video.example.org/embed/1", "about:blank", "about:srcdoc", "blob:https://acme.example.com/1", "data:text/html,hi"] {
            XCTAssertEqual(decide(url, mainFrame: false), .load, url)
        }
        for url in ["file:///etc/hosts", "content://x", "intent://x", "myapp://x", "tel:123"] {
            XCTAssertEqual(decide(url, mainFrame: false), .refuse, url)
        }
    }
}
