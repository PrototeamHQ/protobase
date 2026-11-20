import Capacitor

/**
 * The shell's top bar on a phone as the system navigation bar over the app's web view, with the system's own material.
 * `set` takes the bar the shell wants, `{ visible, title, back, menu, search, actions: [{ label, icon }], account: { label, text },
 * colors }` (TopBarState), each time it changes, and `visible: false` while the shell draws its own; a tap is the `back`,
 * `menu`, `search` or `account` event, or `action` with the action's `index`,
 * which the shell answers as a tap on its own link or button, and the bar's height, in points, the status bar
 * included, is the `height` event each time it changes, kept for the first listener, so the page keeps that much clear
 * above its content. `set` resolves with `{ height }` too while the bar shows.
 */
@objc(ProtobaseTopBar)
public class ProtobaseTopBar: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProtobaseTopBar"
    public let jsName = "ProtobaseTopBar"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)]

    private var bar: NativeTopBar?

    @objc func set(_ call: CAPPluginCall) {
        guard let state = TopBarState.parse(call.options) else {
            return call.reject("ProtobaseTopBar.set takes { visible, title, back, menu, search, actions, account: { label, text }, colors }")
        }
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
                guard let self, let bar = self.made() else { return call.reject("ProtobaseTopBar has no web view to stand over") }
                bar.show(state)
                call.resolve(bar.height.map { ["height": Double($0)] } ?? [:])
            }
        }
    }

    // The bar, made over the web view on first use
    @MainActor private func made() -> NativeTopBar? {
        if let bar { return bar }
        guard let webView = bridge?.webView else { return nil }
        let made = NativeTopBar(
            over: webView,
            onTap: { [weak self] control in self?.notifyListeners(control.rawValue, data: [:]) },
            onAction: { [weak self] index in self?.notifyListeners("action", data: ["index": index]) },
            onHeight: { [weak self] height in self?.notifyListeners("height", data: ["height": Double(height)], retainUntilConsumed: true) })
        bar = made
        return made
    }
}
