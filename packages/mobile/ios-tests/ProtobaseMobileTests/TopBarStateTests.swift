import XCTest
@testable import ProtobaseMobile

/** What `ProtobaseTopBar.set` takes from the shell. */
final class TopBarStateTests: XCTestCase {
    func testTakesTheTitleTheWayBackAndTheAccount() {
        let state = TopBarState.parse(["visible": true, "title": "Ada", "back": "Customers", "menu": false, "account": ["label": "Account, Ada", "text": "AL"]])
        XCTAssertEqual(state, .shown(title: "Ada", back: "Customers", menu: false, search: false, account: .init(label: "Account, Ada", text: "AL")))
    }

    func testTakesNoWayBackTheMenuAndSearch() {
        XCTAssertEqual(TopBarState.parse(["visible": true, "title": "Home", "back": NSNull(), "menu": true, "search": true]), .shown(title: "Home", back: nil, menu: true, search: true, account: nil))
    }

    func testTakesTheGuestEntry() {
        XCTAssertEqual(TopBarState.parse(["visible": true, "title": "Home", "account": ["label": "Sign in", "text": ""]]), .shown(title: "Home", back: nil, menu: false, search: false, account: .init(label: "Sign in", text: "")))
    }

    func testTakesNoBar() {
        XCTAssertEqual(TopBarState.parse(["visible": false]), .hidden)
    }

    func testCutsLongTexts() {
        let long = String(repeating: "x", count: TopBarState.maxText + 10)
        XCTAssertEqual(TopBarState.parse(["visible": true, "title": long, "account": ["label": "A", "text": "ABCDE"]]), .shown(title: String(long.prefix(TopBarState.maxText)), back: nil, menu: false, search: false, account: .init(label: "A", text: "ABC")))
    }

    func testRefusesAnythingElse() {
        XCTAssertNil(TopBarState.parse([:]))
        XCTAssertNil(TopBarState.parse(["visible": true]))
        XCTAssertNil(TopBarState.parse(["visible": true, "title": 4]))
    }
}
