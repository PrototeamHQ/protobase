import Foundation

/**
 * What the shell asks the native tab bar to show (`ProtobaseTabBar.set`): its tabs, each a label and its icon as a PNG
 * at 3x, or `search` for the app's search, and which one is current; or, `visible: false`, none. Anything else is no state, which the call is refused for.
 */
enum TabBarState: Equatable {
    struct Tab: Equatable {
        let label: String
        let icon: Data?
        /** The app's search, which the bar draws as the system's own search, apart from the tabs. */
        var search = false
    }

    case hidden
    case shown(tabs: [Tab], selected: Int?)

    static let maxTabs = 8
    /** In characters: a longer label is cut to it, so one long label never leaves the app without its tabs. */
    static let maxLabel = 64
    private static let maxIcon = 64 * 1024
    private static let pngPrefix = "data:image/png;base64,"

    static func parse(_ options: [AnyHashable: Any]) -> TabBarState? {
        guard let visible = options["visible"] as? Bool else { return nil }
        if !visible { return .hidden }
        guard let items = options["tabs"] as? [[String: Any]], !items.isEmpty, items.count <= maxTabs else { return nil }
        var tabs: [Tab] = []
        for item in items {
            guard let label = item["label"] as? String else { return nil }
            tabs.append(Tab(label: String(label.prefix(maxLabel)), icon: icon(item["icon"]), search: item["search"] as? Bool == true))
        }
        let selected = (options["selected"] as? Int).flatMap { tabs.indices.contains($0) ? $0 : nil }
        return .shown(tabs: tabs, selected: selected)
    }

    /** A PNG data URL within its size, decoded; anything else is no icon. */
    static func icon(_ value: Any?) -> Data? {
        guard let text = value as? String, text.hasPrefix(pngPrefix), text.count <= maxIcon * 4 / 3 + pngPrefix.count + 4 else { return nil }
        return Data(base64Encoded: String(text.dropFirst(pngPrefix.count)))
    }
}
