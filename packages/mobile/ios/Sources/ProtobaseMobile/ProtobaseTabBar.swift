import Capacitor

/**
 * The shell's mobile bottom bar as the system tab bar over the app's web view. `set` takes the bar the shell wants,
 * `{ visible, tabs: [{ label, icon }], selected }` (TabBarState), each time it changes, and `visible: false` while the
 * shell shows none; a tap is the `tap` event with the tab's `index`, which the shell navigates on, and the bar's height,
 * in points, the home indicator's inset included, is the `height` event each time it changes, kept for the first
 * listener, so the page keeps that much clear below its content. `set` resolves with `{ height }` too while the bar
 * shows, so a page that starts listening later, as when its bottom bar is drawn again, has it.
 */
@objc(ProtobaseTabBar)
public class ProtobaseTabBar: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProtobaseTabBar"
    public let jsName = "ProtobaseTabBar"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)]

    private var bar: NativeTabBar?

    @objc func set(_ call: CAPPluginCall) {
        guard let state = TabBarState.parse(call.options) else {
            return call.reject("ProtobaseTabBar.set takes { visible, tabs: [{ label, icon }], selected }, at most \(TabBarState.maxTabs) tabs")
        }
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
                guard let self, let bar = self.made() else { return call.reject("ProtobaseTabBar has no web view to stand over") }
                bar.show(state)
                call.resolve(bar.height.map { ["height": Double($0)] } ?? [:])
            }
        }
    }

    // The bar, made over the web view on first use
    @MainActor private func made() -> NativeTabBar? {
        if let bar { return bar }
        guard let webView = bridge?.webView else { return nil }
        let made = NativeTabBar(
            over: webView,
            onTap: { [weak self] index in self?.notifyListeners("tap", data: ["index": index]) },
            onHeight: { [weak self] height in self?.notifyListeners("height", data: ["height": Double(height)], retainUntilConsumed: true) })
        bar = made
        return made
    }
}
