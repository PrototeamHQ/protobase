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

/** A colour fading from solid at the top to clear at the bottom. */
final class FadeView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }

    var color: UIColor = .clear {
        didSet {
            let layer = layer as! CAGradientLayer
            layer.colors = [color.cgColor, color.cgColor, color.withAlphaComponent(0).cgColor]
            layer.locations = [0, 0.5, 1]
        }
    }
}

/**
 * The system navigation bar over the top of a web view, up behind the status bar, laid out and coloured as the shell's
 * own bar, with the system's controls: the page's title at the leading side, after the system's back button naming the
 * page it goes to or the menu's button where there is no way back, and search, the app's actions and the account's
 * avatar at the trailing side, as the shell asks (TopBarState). A tap is handed back by control, or by the action's
 * place; the bar never pops an item itself, since the shell goes back and asks for the next page's bar. Hidden while
 * the shell draws its own. As the page scrolls under it (`scrolled(by:)`), its background turns into a fade towards the
 * content and its title goes, its controls staying, in step with the scroll over the bar's own height.
 */
@MainActor
final class NativeTopBar: NSObject, UINavigationBarDelegate {
    enum Control: String {
        case back, menu, search, account
    }

    let bar = MeasuredNavigationBar()
    /** The bar's background, from edge to edge and up behind the status bar, which the bar itself, inset by the margin, cannot draw. */
    let backdrop = UIView()
    /** The background at the page's top: solid. */
    let solid = UIView()
    /** The background once the page scrolls under the bar: the same colour, fading out towards the content. */
    let fade = FadeView()
    private var title: UILabel?
    /** How far the page has scrolled under the bar: 0 at the top, 1 once it has scrolled the bar's height. */
    private(set) var progress: CGFloat = 0
    /** The system's side margin on a phone, which a navigation controller gives its bar's buttons. */
    static let margin: CGFloat = 16
    private let onTap: (Control) -> Void
    private let onAction: (Int) -> Void
    private var shown: TopBarState = .hidden

    init(over view: UIView, onTap: @escaping (Control) -> Void, onAction: @escaping (Int) -> Void = { _ in }, onHeight: @escaping (CGFloat) -> Void) {
        self.onTap = onTap
        self.onAction = onAction
        super.init()
        bar.onHeight = onHeight
        bar.isHidden = true
        bar.delegate = self
        bar.accessibilityIdentifier = "Top bar"
        bar.translatesAutoresizingMaskIntoConstraints = false
        backdrop.isHidden = true
        backdrop.isUserInteractionEnabled = false
        backdrop.translatesAutoresizingMaskIntoConstraints = false
        for layer in [solid, fade] {
            layer.frame = backdrop.bounds
            layer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            backdrop.addSubview(layer)
        }
        fade.alpha = 0
        view.addSubview(backdrop)
        view.addSubview(bar)
        NSLayoutConstraint.activate([
            backdrop.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            backdrop.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            backdrop.topAnchor.constraint(equalTo: view.topAnchor),
            backdrop.bottomAnchor.constraint(equalTo: bar.bottomAnchor),
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
        guard case let .shown(title, back, menu, search, actions, account, colors) = state else {
            bar.isHidden = true
            backdrop.isHidden = true
            return
        }
        paint(colors)
        let foreground = colors.foreground.map(Self.uiColor) ?? .label
        // The title at the leading side, as the shell's bar has it, rather than the system's centred one
        let page = UINavigationItem(title: title)
        page.titleView = UIView()
        page.leftItemsSupplementBackButton = true
        var leading: [UIBarButtonItem] = []
        if back == nil, menu {
            let item = UIBarButtonItem(image: UIImage(systemName: "line.3.horizontal"), primaryAction: UIAction { [weak self] _ in self?.onTap(.menu) })
            item.accessibilityLabel = NSLocalizedString("Menu", comment: "The top bar's menu button")
            leading.append(item)
        }
        let label = Self.titleLabel(title, color: foreground)
        label.alpha = 1 - progress
        self.title = label
        leading.append(Self.plain(UIBarButtonItem(customView: label)))
        page.leftBarButtonItems = leading
        // Right to left: the account, the actions, then search
        var trailing: [UIBarButtonItem] = []
        if let account {
            let item = UIBarButtonItem(image: Self.avatar(account.text, circle: colors.avatar.map(Self.uiColor), text: colors.avatarText.map(Self.uiColor)), primaryAction: UIAction { [weak self] _ in self?.onTap(.account) })
            item.accessibilityLabel = account.label
            trailing.append(colors.avatar == nil ? item : Self.plain(item))
        }
        for (index, action) in actions.enumerated().reversed() {
            let image = action.icon.flatMap { UIImage(data: $0, scale: 3) }?.withRenderingMode(.alwaysTemplate) ?? UIImage(systemName: "ellipsis")
            let item = UIBarButtonItem(image: image, primaryAction: UIAction { [weak self] _ in self?.onAction(index) })
            item.accessibilityLabel = action.label
            trailing.append(item)
        }
        if search {
            trailing.append(UIBarButtonItem(systemItem: .search, primaryAction: UIAction { [weak self] _ in self?.onTap(.search) }))
        }
        page.rightBarButtonItems = trailing
        // The page the way back goes to is the item beneath, so the bar draws the system's back button with its name
        bar.setItems(back.map { [UINavigationItem(title: $0), page] } ?? [page], animated: false)
        bar.isHidden = false
        backdrop.isHidden = false
    }

    /** The page scrolled `offset` points down from its top: the background and the title follow it linearly, with no animation of their own. */
    func scrolled(by offset: CGFloat) {
        let distance = bar.bounds.height > 0 ? bar.bounds.height : 44
        let progress = min(max(offset / distance, 0), 1)
        guard progress != self.progress else { return }
        self.progress = progress
        solid.alpha = 1 - progress
        fade.alpha = progress
        title?.alpha = 1 - progress
    }

    /** The bar's height while it shows, the status bar included; none while hidden or not yet laid out. */
    var height: CGFloat? { bar.isHidden || bar.bounds.height == 0 ? nil : bar.frame.maxY }

    func position(for bar: UIBarPositioning) -> UIBarPosition { .topAttached }

    func navigationBar(_ navigationBar: UINavigationBar, shouldPop item: UINavigationItem) -> Bool {
        onTap(.back)
        return false
    }

    // The bar in the shell's colours: its background behind it from edge to edge, the system's own where the shell's bar
    // has no colour of its own, and its title and controls, the system's glass behind them dark or light as the background
    private func paint(_ colors: TopBarState.Colors) {
        let background = colors.background.map(Self.uiColor)
        solid.backgroundColor = background ?? .systemBackground
        fade.color = background ?? .systemBackground
        let look = UINavigationBarAppearance()
        look.configureWithTransparentBackground()
        let foreground = colors.foreground.map(Self.uiColor)
        if let foreground {
            look.titleTextAttributes = [.foregroundColor: foreground]
            let buttons = UIBarButtonItemAppearance()
            buttons.normal.titleTextAttributes = [.foregroundColor: foreground]
            look.buttonAppearance = buttons
            look.backButtonAppearance = buttons
        }
        bar.standardAppearance = look
        bar.scrollEdgeAppearance = look
        bar.compactAppearance = look
        bar.tintColor = foreground
        bar.overrideUserInterfaceStyle = background.map { Self.isDark($0) ? .dark : .light } ?? .unspecified
    }

    /** Whether a colour is dark enough that light text reads on it, by its relative luminance. */
    static func isDark(_ color: UIColor) -> Bool {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.5
    }

    static func uiColor(_ color: TopBarState.Color) -> UIColor {
        UIColor(red: color.red, green: color.green, blue: color.blue, alpha: color.alpha)
    }

    // An item drawn as itself, without the glass the system puts behind bar items
    private static func plain(_ item: UIBarButtonItem) -> UIBarButtonItem {
        if #available(iOS 26.0, *) { item.hidesSharedBackground = true }
        return item
    }

    private static func titleLabel(_ title: String, color: UIColor) -> UILabel {
        let label = UILabel()
        label.text = title
        label.font = .systemFont(ofSize: 20, weight: .semibold)
        label.textColor = color
        label.lineBreakMode = .byTruncatingTail
        label.accessibilityTraits = .header
        return label
    }

    // The account's initials in the avatar's own colours, as the shell draws it; without them, cut out of a circle in the
    // bar's tint, or the system's person icon without initials
    private static func avatar(_ initials: String, circle: UIColor? = nil, text: UIColor? = nil) -> UIImage? {
        guard !initials.isEmpty else { return UIImage(systemName: "person.crop.circle") }
        let size = CGSize(width: 34, height: 34)
        let image = UIGraphicsImageRenderer(size: size).image { context in
            (circle ?? .black).setFill()
            UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
            if circle == nil { context.cgContext.setBlendMode(.clear) }
            let font = UIFont.systemFont(ofSize: 13, weight: .semibold)
            let letters = NSAttributedString(string: initials, attributes: [.font: font, .foregroundColor: text ?? .black])
            let box = letters.size()
            letters.draw(at: CGPoint(x: (size.width - box.width) / 2, y: (size.height - box.height) / 2))
        }
        return image.withRenderingMode(circle == nil ? .alwaysTemplate : .alwaysOriginal)
    }
}
