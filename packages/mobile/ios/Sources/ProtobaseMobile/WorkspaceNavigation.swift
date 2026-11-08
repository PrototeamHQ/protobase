import Foundation

/**
 * What a workspace view does with a navigation. Its main frame loads only its own origin; a `GET` of another `http` or
 * `https` URL opens in the system browser instead, and anything else is refused: another scheme, a longer URL than a
 * link opens elsewhere (2048 characters), and a `POST` to another origin, whose body the browser cannot carry. Frames
 * load as in a browser: `http`, `https` and the schemes pages build frames with; never `file:` or a scheme another app
 * handles. New windows (`target=_blank`, `window.open`) count as main-frame navigations.
 */
enum WorkspaceNavigation {
    enum Decision: Equatable {
        case load
        case openExternally
        case refuse
    }

    private static let webSchemes: Set<String> = ["http", "https"]
    private static let frameSchemes: Set<String> = ["http", "https", "about", "blob", "data"]

    /** What the view at `workspace` does with a navigation to `url` by `method`, in its main frame or a frame. */
    static func decide(_ url: URL, mainFrame: Bool, method: String, workspace: URL) -> Decision {
        let scheme = (url.scheme ?? "").lowercased()
        if !mainFrame { return frameSchemes.contains(scheme) ? .load : .refuse }
        guard webSchemes.contains(scheme), url.host != nil else { return .refuse }
        if SameOrigin.matches(url, workspace) { return .load }
        guard method.uppercased() == "GET", url.absoluteString.count <= 2048 else { return .refuse }
        return .openExternally
    }
}
