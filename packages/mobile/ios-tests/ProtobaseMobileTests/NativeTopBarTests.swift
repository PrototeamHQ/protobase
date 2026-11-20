import UIKit
import XCTest
@testable import ProtobaseMobile

@MainActor
final class NativeTopBarTests: XCTestCase {
    private func made() -> (NativeTopBar, () -> [NativeTopBar.Control]) {
        var taps: [NativeTopBar.Control] = []
        let view = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let bar = NativeTopBar(over: view, onTap: { taps.append($0) }, onHeight: { _ in })
        return (bar, { taps })
    }

    func testTheWayBackIsTheItemBeneathAndNeverPops() {
        let (bar, taps) = made()
        bar.show(.shown(title: "Ada", back: "Customers", menu: true, search: false, account: nil))
        XCTAssertEqual(bar.bar.items?.map(\.title), ["Customers", "Ada"])
        XCTAssertNil(bar.bar.topItem?.leftBarButtonItem)
        XCTAssertFalse(bar.navigationBar(bar.bar, shouldPop: bar.bar.topItem!))
        XCTAssertEqual(taps(), [.back])
    }

    func testTheMenuShowsWhereThereIsNoWayBackAndSearchBesideTheAccount() {
        let (bar, _) = made()
        bar.show(.shown(title: "Home", back: nil, menu: true, search: true, account: .init(label: "Account, Ada", text: "AL")))
        XCTAssertEqual(bar.bar.items?.map(\.title), ["Home"])
        XCTAssertNotNil(bar.bar.topItem?.leftBarButtonItem)
        XCTAssertEqual(bar.bar.topItem?.rightBarButtonItems?.count, 2)
        XCTAssertEqual(bar.bar.topItem?.rightBarButtonItems?.first?.accessibilityLabel, "Account, Ada")
    }

    func testHidesForNoBar() {
        let (bar, _) = made()
        bar.show(.shown(title: "Home", back: nil, menu: false, search: false, account: nil))
        XCTAssertFalse(bar.bar.isHidden)
        bar.show(.hidden)
        XCTAssertTrue(bar.bar.isHidden)
        XCTAssertNil(bar.height)
    }
}
