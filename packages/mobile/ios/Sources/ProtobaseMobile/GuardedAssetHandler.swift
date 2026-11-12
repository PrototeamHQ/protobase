import Capacitor
import ObjectiveC
import WebKit

/**
 * Capacitor's asset handler with LocalFileGuard in front. WebKit holds the handler from the WebView's creation, before
 * any plugin loads, so `install` switches the live instance to this class, which adds no stored state; the guard is an
 * associated object. One lock covers the check and the serving, and `setAssetPath`, so the base path cannot change
 * between them. Every request waits at PageGate while a fresh install's purge runs.
 */
final class GuardedAssetHandler: WebViewAssetHandler {
    private static var guardKey: UInt8 = 0

    static func install(on handler: WebViewAssetHandler, _ fileGuard: LocalFileGuard) {
        objc_setAssociatedObject(handler, &guardKey, fileGuard, .OBJC_ASSOCIATION_RETAIN)
        object_setClass(handler, GuardedAssetHandler.self)
    }

    private var fileGuard: LocalFileGuard {
        guard let fileGuard = objc_getAssociatedObject(self, &Self.guardKey) as? LocalFileGuard else { fatalError("GuardedAssetHandler has no LocalFileGuard") }
        return fileGuard
    }

    override func setAssetPath(_ assetPath: String) {
        let fileGuard = fileGuard
        fileGuard.withLock {
            fileGuard.basePath = assetPath
            super.setAssetPath(assetPath)
        }
    }

    override func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        PageGate.shared.whenOpen(ObjectIdentifier(urlSchemeTask)) { [self] in serve(webView, urlSchemeTask) }
    }

    // A request WebKit stops while it waits at the gate is never started.
    override func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        if PageGate.shared.cancel(ObjectIdentifier(urlSchemeTask)) { return }
        super.webView(webView, stop: urlSchemeTask)
    }

    private func serve(_ webView: WKWebView, _ urlSchemeTask: WKURLSchemeTask) {
        let fileGuard = fileGuard
        fileGuard.withLock {
            if fileGuard.refuses(path: urlSchemeTask.request.url?.path ?? "") {
                forbid(urlSchemeTask)
                return
            }
            super.webView(webView, start: urlSchemeTask)
        }
    }

    // An empty 403, as Android's LocalServerGuard answers.
    private func forbid(_ urlSchemeTask: WKURLSchemeTask) {
        let url = urlSchemeTask.request.url ?? URL(fileURLWithPath: "/")
        urlSchemeTask.didReceive(HTTPURLResponse(url: url, statusCode: 403, httpVersion: nil, headerFields: [:])!)
        urlSchemeTask.didReceive(Data())
        urlSchemeTask.didFinish()
    }
}
