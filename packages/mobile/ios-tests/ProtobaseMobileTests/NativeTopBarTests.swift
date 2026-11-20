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
        bar.show(.shown(title: "Ada", back: "Customers", menu: true, search: false, actions: [], account: nil, colors: .init()))
        XCTAssertEqual(bar.bar.items?.map(\.title), ["Customers", "Ada"])
        XCTAssertEqual(bar.bar.topItem?.leftBarButtonItems?.count, 1, "the title only")
        XCTAssertFalse(bar.navigationBar(bar.bar, shouldPop: bar.bar.topItem!))
        XCTAssertEqual(taps(), [.back])
    }

    func testTheMenuShowsWhereThereIsNoWayBackAndSearchBesideTheAccount() {
        let (bar, _) = made()
        bar.show(.shown(title: "Home", back: nil, menu: true, search: true, actions: [], account: .init(label: "Account, Ada", text: "AL"), colors: .init()))
        XCTAssertEqual(bar.bar.items?.map(\.title), ["Home"])
        XCTAssertEqual(bar.bar.topItem?.leftBarButtonItems?.count, 2, "the menu, then the title")
        XCTAssertEqual((bar.bar.topItem?.leftBarButtonItems?.last?.customView as? UILabel)?.text, "Home")
        XCTAssertEqual(bar.bar.topItem?.rightBarButtonItems?.count, 2)
        XCTAssertEqual(bar.bar.topItem?.rightBarButtonItems?.first?.accessibilityLabel, "Account, Ada")
    }

    func testActionsSitBetweenSearchAndTheAccountAndTellTheirPlace() {
        var tapped: [Int] = []
        let bar = NativeTopBar(over: UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844)), onTap: { _ in }, onAction: { tapped.append($0) }, onHeight: { _ in })
        let actions: [TopBarState.Action] = [.init(label: "Share", icon: nil), .init(label: "More actions", icon: nil)]
        bar.show(.shown(title: "Listings", back: nil, menu: false, search: true, actions: actions, account: .init(label: "Account", text: "MD"), colors: .init()))
        let trailing = bar.bar.topItem?.rightBarButtonItems ?? []
        XCTAssertEqual(trailing.dropLast().map(\.accessibilityLabel), ["Account", "More actions", "Share"])
        trailing[1].primaryAction?.performWithSender(nil, target: nil)
        XCTAssertEqual(tapped, [1])
    }

    func testTakesTheShellsColours() {
        let (bar, _) = made()
        let slate = TopBarState.Color(red: 0.2, green: 0.25, blue: 0.3, alpha: 1)
        let white = TopBarState.Color(red: 1, green: 1, blue: 1, alpha: 1)
        bar.show(.shown(title: "Home", back: nil, menu: false, search: false, actions: [], account: nil, colors: .init(background: slate, foreground: white)))
        XCTAssertEqual(bar.bar.standardAppearance.backgroundColor, NativeTopBar.uiColor(slate))
        XCTAssertEqual(bar.bar.scrollEdgeAppearance?.backgroundColor, NativeTopBar.uiColor(slate))
        XCTAssertEqual(bar.bar.tintColor, NativeTopBar.uiColor(white))
    }

    func testHidesForNoBar() {
        let (bar, _) = made()
        bar.show(.shown(title: "Home", back: nil, menu: false, search: false, actions: [], account: nil, colors: .init()))
        XCTAssertFalse(bar.bar.isHidden)
        bar.show(.hidden)
        XCTAssertTrue(bar.bar.isHidden)
        XCTAssertNil(bar.height)
    }
}
