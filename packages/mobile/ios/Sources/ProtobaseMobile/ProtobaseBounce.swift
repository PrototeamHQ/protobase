import Capacitor

/**
 * Gives the page back the bounce of a native iOS app at its top and bottom edges. Capacitor turns it off on every
 * WebView it creates (CAPBridgeViewController.swift:301) and has no setting for it, and the page scrolls the WebView's
 * own scroll view. A short page bounces too, as a native list does; sideways it never does. The space a bounce shows
 * takes the page's background, as in Safari, instead of the system's that Capacitor gives the scroll view, which is
 * black under a dark page that is not. The system's own fade at the top edge (iOS 26's scroll edge effect) is off, as
 * the page draws its own bar there, which the fade would turn into a gradient. The bridge loads plugins once the WebView
 * exists, on the main thread.
 */
@objc(ProtobaseBounce)
public class ProtobaseBounce: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProtobaseBounce"
    public let jsName = "ProtobaseBounce"
    public let pluginMethods: [CAPPluginMethod] = []

    override public func load() {
        guard let scrollView = bridge?.webView?.scrollView else { return }
        scrollView.bounces = true
        scrollView.alwaysBounceVertical = true
        scrollView.alwaysBounceHorizontal = false
        scrollView.backgroundColor = nil
        if #available(iOS 26.0, *) { scrollView.topEdgeEffect.isHidden = true }
    }
}
