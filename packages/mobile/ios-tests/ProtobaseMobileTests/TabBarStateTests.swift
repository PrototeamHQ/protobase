import XCTest
@testable import ProtobaseMobile

/** What `ProtobaseTabBar.set` takes from the shell. */
final class TabBarStateTests: XCTestCase {
    private let png = "data:image/png;base64," + Data([0x89, 0x50, 0x4e, 0x47]).base64EncodedString()

    func testTakesTabsAndTheCurrentOne() {
        let state = TabBarState.parse(["visible": true, "tabs": [["label": "Home", "icon": png], ["label": "More", "icon": NSNull()]], "selected": 1])
        XCTAssertEqual(state, .shown(tabs: [.init(label: "Home", icon: Data([0x89, 0x50, 0x4e, 0x47])), .init(label: "More", icon: nil)], selected: 1))
    }

    func testTakesTheSearchTab() {
        XCTAssertEqual(TabBarState.parse(["visible": true, "tabs": [["label": "Home"], ["label": "Search", "search": true]]]), .shown(tabs: [.init(label: "Home", icon: nil), .init(label: "Search", icon: nil, search: true)], selected: nil))
    }

    func testTakesNoBar() {
        XCTAssertEqual(TabBarState.parse(["visible": false]), .hidden)
    }

    func testACurrentTabOutsideTheTabsIsNone() {
        XCTAssertEqual(TabBarState.parse(["visible": true, "tabs": [["label": "Home"]], "selected": NSNull()]), .shown(tabs: [.init(label: "Home", icon: nil)], selected: nil))
        XCTAssertEqual(TabBarState.parse(["visible": true, "tabs": [["label": "Home"]], "selected": 4]), .shown(tabs: [.init(label: "Home", icon: nil)], selected: nil))
    }

    func testRefusesAnythingElse() {
        XCTAssertNil(TabBarState.parse([:]))
        XCTAssertNil(TabBarState.parse(["visible": true, "tabs": []]))
        XCTAssertNil(TabBarState.parse(["visible": true, "tabs": Array(repeating: ["label": "x"], count: TabBarState.maxTabs + 1)]))
        XCTAssertNil(TabBarState.parse(["visible": true, "tabs": [["icon": png]]]))
    }

    func testCutsALongLabelAndKeepsTheOtherTabs() {
        let long = String(repeating: "é", count: TabBarState.maxLabel + 1)
        XCTAssertEqual(TabBarState.parse(["visible": true, "tabs": [["label": long], ["label": "More"]]]), .shown(tabs: [.init(label: String(repeating: "é", count: TabBarState.maxLabel), icon: nil), .init(label: "More", icon: nil)], selected: nil))
    }

    func testAnIconThatIsNoPngIsNone() {
        XCTAssertEqual(TabBarState.parse(["visible": true, "tabs": [["label": "Home", "icon": "data:image/svg+xml,<svg/>"]]]), .shown(tabs: [.init(label: "Home", icon: nil)], selected: nil))
    }
}
