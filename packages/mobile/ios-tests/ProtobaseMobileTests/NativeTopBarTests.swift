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
        XCTAssertEqual(bar.solid.backgroundColor, NativeTopBar.uiColor(slate))
        XCTAssertFalse(bar.backdrop.isHidden)
        XCTAssertEqual(bar.bar.tintColor, NativeTopBar.uiColor(white))
        XCTAssertEqual(bar.bar.overrideUserInterfaceStyle, .dark)
    }

    func testTheBackgroundRunsFromEdgeToEdge() {
        let (bar, _) = made()
        bar.show(.shown(title: "Home", back: nil, menu: false, search: false, actions: [], account: nil, colors: .init()))
        let view = try! XCTUnwrap(bar.bar.superview)
        view.layoutIfNeeded()
        XCTAssertEqual(bar.backdrop.frame.minX, 0)
        XCTAssertEqual(bar.backdrop.frame.width, view.bounds.width)
        XCTAssertEqual(bar.backdrop.frame.minY, 0)
        XCTAssertEqual(bar.backdrop.frame.maxY, bar.bar.frame.maxY)
        bar.show(.hidden)
        XCTAssertTrue(bar.backdrop.isHidden)
    }

    func testHidesForNoBar() {
        let (bar, _) = made()
        bar.show(.shown(title: "Home", back: nil, menu: false, search: false, actions: [], account: nil, colors: .init()))
        XCTAssertFalse(bar.bar.isHidden)
        bar.show(.hidden)
        XCTAssertTrue(bar.bar.isHidden)
        XCTAssertNil(bar.height)
    }

    func testTheScrollFadesTheBackgroundAndTheTitleLinearly() {
        let (bar, _) = made()
        bar.show(.shown(title: "Home", back: "Customers", menu: false, search: true, actions: [], account: nil, colors: .init()))
        bar.bar.superview?.layoutIfNeeded()
        let distance = bar.bar.bounds.height
        let title = { bar.bar.topItem?.leftBarButtonItems?.last?.customView?.alpha }
        XCTAssertEqual(title(), 1)
        XCTAssertEqual(bar.fade.alpha, 0)
        bar.scrolled(by: distance / 4)
        XCTAssertEqual(title() ?? 0, 0.75, accuracy: 0.001)
        XCTAssertEqual(bar.solid.alpha, 0.75, accuracy: 0.001)
        XCTAssertEqual(bar.fade.alpha, 0.25, accuracy: 0.001)
        bar.scrolled(by: distance * 3)
        XCTAssertEqual(title(), 0)
        XCTAssertEqual(bar.fade.alpha, 1)
        XCTAssertEqual(bar.bar.topItem?.rightBarButtonItems?.count, 1)
        // A new page's bar keeps the scroll's look; back up, it reverses exactly
        bar.show(.shown(title: "Ada", back: "Customers", menu: false, search: true, actions: [], account: nil, colors: .init()))
        XCTAssertEqual(title(), 0)
        bar.scrolled(by: distance / 2)
        XCTAssertEqual(title() ?? 0, 0.5, accuracy: 0.001)
        bar.scrolled(by: -20)
        XCTAssertEqual(title(), 1)
        XCTAssertEqual(bar.solid.alpha, 1)
    }
}
