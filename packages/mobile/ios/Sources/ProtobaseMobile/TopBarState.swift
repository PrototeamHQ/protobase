import Foundation

/**
 * What the shell asks the native top bar to show (`ProtobaseTopBar.set`): the page's title, the label of the page the
 * way back goes to, or none, whether it has the navigation menu's button and the search button, the app's actions,
 * each a label and its icon as a PNG at 3x, its account entry, the avatar's initials with the label it is read by, or
 * `text` empty for the guest icon, and the web bar's colours as `#rrggbbaa`, for the native bar to look the same; or,
 * `visible: false`, none. Anything else is no state, which the call is refused for.
 */
enum TopBarState: Equatable {
    struct Account: Equatable {
        let label: String
        let text: String
    }

    struct Action: Equatable {
        let label: String
        let icon: Data?
    }

    /** The bar's background, its text and icons, and the avatar's circle and initials; nil for the system's own. */
    struct Colors: Equatable {
        var background: Color?
        var foreground: Color?
        var avatar: Color?
        var avatarText: Color?
    }

    /** A colour as red, green, blue and alpha, each 0 to 1. */
    struct Color: Equatable {
        let red, green, blue, alpha: Double
    }

    case hidden
    case shown(title: String, back: String?, menu: Bool, search: Bool, actions: [Action], account: Account?, colors: Colors)

    /** In characters: a longer text is cut to it, so one long title never leaves the page without its bar. */
    static let maxText = 128
    /** The avatar's initials, at most this many characters. */
    static let maxInitials = 3
    static let maxActions = 4

    static func parse(_ options: [AnyHashable: Any]) -> TopBarState? {
        guard let visible = options["visible"] as? Bool else { return nil }
        if !visible { return .hidden }
        guard let title = options["title"] as? String else { return nil }
        let actions = ((options["actions"] as? [[String: Any]]) ?? []).prefix(maxActions).map { Action(label: cut($0["label"] as? String ?? ""), icon: TabBarState.icon($0["icon"])) }
        return .shown(title: cut(title), back: (options["back"] as? String).map(cut), menu: options["menu"] as? Bool == true, search: options["search"] as? Bool == true, actions: Array(actions), account: account(options["account"]), colors: colors(options["colors"]))
    }

    private static func colors(_ value: Any?) -> Colors {
        guard let item = value as? [String: Any] else { return Colors() }
        return Colors(background: color(item["background"]), foreground: color(item["foreground"]), avatar: color(item["avatar"]), avatarText: color(item["avatarText"]))
    }

    /** `#rrggbbaa` or `#rrggbb`; anything else is no colour. */
    static func color(_ value: Any?) -> Color? {
        guard let text = value as? String, text.hasPrefix("#"), text.count == 7 || text.count == 9, let number = UInt32(text.dropFirst(), radix: 16) else { return nil }
        let rgba = text.count == 7 ? number << 8 | 0xff : number
        let part = { (shift: UInt32) in Double((rgba >> shift) & 0xff) / 255 }
        return Color(red: part(24), green: part(16), blue: part(8), alpha: part(0))
    }

    private static func account(_ value: Any?) -> Account? {
        guard let item = value as? [String: Any], let label = item["label"] as? String else { return nil }
        return Account(label: cut(label), text: String((item["text"] as? String ?? "").prefix(maxInitials)))
    }

    private static func cut(_ text: String) -> String { String(text.prefix(maxText)) }
}
