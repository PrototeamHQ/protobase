import Foundation

/**
 * What the shell asks the native top bar to show (`ProtobaseTopBar.set`): the page's title, the label of the page the
 * way back goes to, or none, whether it has the navigation menu's button and the search button, and its account entry, the avatar's initials
 * with the label it is read by, or `text` empty for the guest icon; or, `visible: false`, none. Anything else is no
 * state, which the call is refused for.
 */
enum TopBarState: Equatable {
    struct Account: Equatable {
        let label: String
        let text: String
    }

    case hidden
    case shown(title: String, back: String?, menu: Bool, search: Bool, account: Account?)

    /** In characters: a longer text is cut to it, so one long title never leaves the page without its bar. */
    static let maxText = 128
    /** The avatar's initials, at most this many characters. */
    static let maxInitials = 3

    static func parse(_ options: [AnyHashable: Any]) -> TopBarState? {
        guard let visible = options["visible"] as? Bool else { return nil }
        if !visible { return .hidden }
        guard let title = options["title"] as? String else { return nil }
        return .shown(title: cut(title), back: (options["back"] as? String).map(cut), menu: options["menu"] as? Bool == true, search: options["search"] as? Bool == true, account: account(options["account"]))
    }

    private static func account(_ value: Any?) -> Account? {
        guard let item = value as? [String: Any], let label = item["label"] as? String else { return nil }
        return Account(label: cut(label), text: String((item["text"] as? String ?? "").prefix(maxInitials)))
    }

    private static func cut(_ text: String) -> String { String(text.prefix(maxText)) }
}
