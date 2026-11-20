import XCTest
@testable import ProtobaseMobile

/** What `ProtobaseTopBar.set` takes from the shell. */
final class TopBarStateTests: XCTestCase {
    func testTakesTheTitleTheWayBackAndTheAccount() {
        let state = TopBarState.parse(["visible": true, "title": "Ada", "back": "Customers", "menu": false, "account": ["label": "Account, Ada", "text": "AL"]])
        XCTAssertEqual(state, .shown(title: "Ada", back: "Customers", menu: false, search: false, actions: [], account: .init(label: "Account, Ada", text: "AL"), colors: .init()))
    }

    func testTakesNoWayBackTheMenuAndSearch() {
        XCTAssertEqual(TopBarState.parse(["visible": true, "title": "Home", "back": NSNull(), "menu": true, "search": true]), .shown(title: "Home", back: nil, menu: true, search: true, actions: [], account: nil, colors: .init()))
    }

    func testTakesTheGuestEntry() {
        XCTAssertEqual(TopBarState.parse(["visible": true, "title": "Home", "account": ["label": "Sign in", "text": ""]]), .shown(title: "Home", back: nil, menu: false, search: false, actions: [], account: .init(label: "Sign in", text: ""), colors: .init()))
    }

    func testTakesNoBar() {
        XCTAssertEqual(TopBarState.parse(["visible": false]), .hidden)
    }

    func testCutsLongTexts() {
        let long = String(repeating: "x", count: TopBarState.maxText + 10)
        XCTAssertEqual(TopBarState.parse(["visible": true, "title": long, "account": ["label": "A", "text": "ABCDE"]]), .shown(title: String(long.prefix(TopBarState.maxText)), back: nil, menu: false, search: false, actions: [], account: .init(label: "A", text: "ABC"), colors: .init()))
    }

    func testRefusesAnythingElse() {
        XCTAssertNil(TopBarState.parse([:]))
        XCTAssertNil(TopBarState.parse(["visible": true]))
        XCTAssertNil(TopBarState.parse(["visible": true, "title": 4]))
    }

    func testReadsActionsAndColours() {
        let state = TopBarState.parse([
            "visible": true, "title": "Listings",
            "actions": [["label": "More actions", "icon": NSNull()]],
            "colors": ["background": "#374151ff", "foreground": "#ffffff", "avatar": "oklch(0.5 0.1 20)"],
        ])
        let white = TopBarState.Color(red: 1, green: 1, blue: 1, alpha: 1)
        let slate = TopBarState.Color(red: 0x37 / 255.0, green: 0x41 / 255.0, blue: 0x51 / 255.0, alpha: 1)
        XCTAssertEqual(state, .shown(title: "Listings", back: nil, menu: false, search: false, actions: [.init(label: "More actions", icon: nil)], account: nil, colors: .init(background: slate, foreground: white, avatar: nil, avatarText: nil)))
    }
}
