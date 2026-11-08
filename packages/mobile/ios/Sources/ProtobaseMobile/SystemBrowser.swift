import SafariServices
import UIKit

/** Opens a URL in the system browser over the app, apart from every workspace's data store. */
enum SystemBrowser {
    @MainActor
    static func open(_ url: URL, from presenter: UIViewController?) {
        var top = presenter
        while let presented = top?.presentedViewController { top = presented }
        top?.present(SFSafariViewController(url: url), animated: true)
    }
}
