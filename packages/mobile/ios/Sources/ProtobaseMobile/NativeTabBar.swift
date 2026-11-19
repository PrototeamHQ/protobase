import UIKit

/** A tab bar that tells its height, the home indicator's inset below it included, whenever it changes. */
final class MeasuredTabBar: UITabBar {
    var onHeight: (CGFloat) -> Void = { _ in }
    private var told: CGFloat = -1

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.height != told else { return }
        told = bounds.height
        onHeight(bounds.height)
    }
}

/**
 * The system tab bar over the bottom of a web view, with the system's own material: its tabs and current tab as the
 * shell asks (TabBarState), a tap handed back by index, and its height, so the page can keep that much clear. Hidden
 * while the shell shows no bottom bar.
 */
@MainActor
final class NativeTabBar: NSObject, UITabBarDelegate {
    let bar = MeasuredTabBar()
    private let onTap: (Int) -> Void
    private var shown: TabBarState = .hidden

    init(over view: UIView, onTap: @escaping (Int) -> Void, onHeight: @escaping (CGFloat) -> Void) {
        self.onTap = onTap
        super.init()
        bar.onHeight = onHeight
        bar.isHidden = true
        bar.delegate = self
        bar.accessibilityIdentifier = "Tabs"
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    func show(_ state: TabBarState) {
        guard state != shown else { return }
        shown = state
        guard case let .shown(tabs, selected) = state else {
            bar.isHidden = true
            return
        }
        // Each item's tag is its tab's index, which a tap hands back; search is the system's own, after the tabs
        let items = tabs.enumerated().map { index, tab in
            tab.search ? UITabBarItem(tabBarSystemItem: .search, tag: index)
                : UITabBarItem(title: tab.label, image: tab.icon.flatMap { UIImage(data: $0, scale: 3) }?.withRenderingMode(.alwaysTemplate), tag: index)
        }
        bar.setItems(items.filter { !tabs[$0.tag].search } + items.filter { tabs[$0.tag].search }, animated: false)
        bar.selectedItem = selected.map { items[$0] }
        bar.isHidden = false
    }

    /** The bar's height while it shows, the home indicator's inset included; none while hidden or not yet laid out. */
    var height: CGFloat? { bar.isHidden || bar.bounds.height == 0 ? nil : bar.bounds.height }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        // Search only opens the shell's search, so the page shown stays the current tab, as the shell last asked; a tab
        // becomes current once the shell navigates and asks for it
        if case let .shown(tabs, selected) = shown, tabs.indices.contains(item.tag), tabs[item.tag].search {
            tabBar.selectedItem = selected.flatMap { index in tabBar.items?.first { $0.tag == index } }
        }
        onTap(item.tag)
    }
}
