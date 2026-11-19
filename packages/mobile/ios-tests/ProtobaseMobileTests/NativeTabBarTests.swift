import UIKit
import XCTest
@testable import ProtobaseMobile

@MainActor
final class NativeTabBarTests: XCTestCase {
    private func made() -> (NativeTabBar, () -> [Int]) {
        var taps: [Int] = []
        let view = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let bar = NativeTabBar(over: view, onTap: { taps.append($0) }, onHeight: { _ in })
        return (bar, { taps })
    }

    func testASearchTapKeepsTheCurrentTabSelected() {
        let (bar, taps) = made()
        bar.show(.shown(tabs: [.init(label: "Home", icon: nil), .init(label: "Search", icon: nil, search: true), .init(label: "More", icon: nil)], selected: 0))
        let search = bar.bar.items!.first { $0.tag == 1 }!
        bar.bar.selectedItem = search
        bar.tabBar(bar.bar, didSelect: search)
        XCTAssertEqual(bar.bar.selectedItem?.tag, 0)
        XCTAssertEqual(taps(), [1])
    }

    func testATabTapIsHandedBack() {
        let (bar, taps) = made()
        bar.show(.shown(tabs: [.init(label: "Home", icon: nil), .init(label: "More", icon: nil)], selected: 0))
        let more = bar.bar.items!.first { $0.tag == 1 }!
        bar.bar.selectedItem = more
        bar.tabBar(bar.bar, didSelect: more)
        XCTAssertEqual(bar.bar.selectedItem?.tag, 1)
        XCTAssertEqual(taps(), [1])
    }

    func testHasNoHeightWhileHidden() {
        let (bar, _) = made()
        XCTAssertNil(bar.height)
    }
}
