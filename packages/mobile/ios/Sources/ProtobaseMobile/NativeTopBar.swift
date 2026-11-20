import UIKit

/** A navigation bar that tells its height, the status bar above it included, whenever it changes. */
final class MeasuredNavigationBar: UINavigationBar {
    var onHeight: (CGFloat) -> Void = { _ in }
    private var told: CGFloat = -1

    override func layoutSubviews() {
        super.layoutSubviews()
        let height = frame.maxY
        guard height != told else { return }
        told = height
        onHeight(height)
    }
}

/**
 * The system navigation bar over the top of a web view, up behind the status bar, with the system's own material: the
 * page's title, a back button naming the page it goes to, the menu's button where there is no way back, and search
 * and the account's avatar at the right, as the shell asks (TopBarState). A tap is handed back by control; the bar never pops
 * an item itself, since the shell goes back and asks for the next page's bar. Hidden while the shell draws its own.
 */
@MainActor
final class NativeTopBar: NSObject, UINavigationBarDelegate {
    enum Control: String {
        case back, menu, search, account
    }

    let bar = MeasuredNavigationBar()
    /** The system's side margin on a phone, which a navigation controller gives its bar's buttons. */
    static let margin: CGFloat = 16
    private let onTap: (Control) -> Void
    private var shown: TopBarState = .hidden

    init(over view: UIView, onTap: @escaping (Control) -> Void, onHeight: @escaping (CGFloat) -> Void) {
        self.onTap = onTap
        super.init()
        bar.onHeight = onHeight
        bar.isHidden = true
        bar.delegate = self
        bar.accessibilityIdentifier = "Top bar"
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        NSLayoutConstraint.activate([
            // Outside a navigation controller the bar's content takes no margins, its own included, and puts its buttons
            // against the screen's edges; the bar stands in by the system's margin instead
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: Self.margin),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -Self.margin),
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
        ])
    }

    func show(_ state: TopBarState) {
        guard state != shown else { return }
        shown = state
        guard case let .shown(title, back, menu, search, account) = state else {
            bar.isHidden = true
            return
        }
        let page = UINavigationItem(title: title)
        if back == nil, menu {
            page.leftBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "line.3.horizontal"), primaryAction: UIAction { [weak self] _ in self?.onTap(.menu) })
            page.leftBarButtonItem?.accessibilityLabel = NSLocalizedString("Menu", comment: "The top bar's menu button")
        }
        // Right to left: the account, then search
        var trailing: [UIBarButtonItem] = []
        if let account {
            let item = UIBarButtonItem(image: Self.avatar(account.text), primaryAction: UIAction { [weak self] _ in self?.onTap(.account) })
            item.accessibilityLabel = account.label
            trailing.append(item)
        }
        if search {
            trailing.append(UIBarButtonItem(systemItem: .search, primaryAction: UIAction { [weak self] _ in self?.onTap(.search) }))
        }
        page.rightBarButtonItems = trailing
        // The page the way back goes to is the item beneath, so the bar draws the system's back button with its name
        bar.setItems(back.map { [UINavigationItem(title: $0), page] } ?? [page], animated: false)
        bar.isHidden = false
    }

    /** The bar's height while it shows, the status bar included; none while hidden or not yet laid out. */
    var height: CGFloat? { bar.isHidden || bar.bounds.height == 0 ? nil : bar.frame.maxY }

    func position(for bar: UIBarPositioning) -> UIBarPosition { .topAttached }

    func navigationBar(_ navigationBar: UINavigationBar, shouldPop item: UINavigationItem) -> Bool {
        onTap(.back)
        return false
    }

    // The account's initials cut out of a circle, or the system's person icon without them, drawn in the bar's tint
    private static func avatar(_ initials: String) -> UIImage? {
        guard !initials.isEmpty else { return UIImage(systemName: "person.crop.circle") }
        let size = CGSize(width: 30, height: 30)
        return UIGraphicsImageRenderer(size: size).image { context in
            UIColor.black.setFill()
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
            context.cgContext.setBlendMode(.clear)
            let font = UIFont.systemFont(ofSize: 12, weight: .semibold)
            let text = NSAttributedString(string: initials, attributes: [.font: font, .foregroundColor: UIColor.black])
            let box = text.size()
            text.draw(at: CGPoint(x: (size.width - box.width) / 2, y: (size.height - box.height) / 2))
        }.withRenderingMode(.alwaysTemplate)
    }
}
