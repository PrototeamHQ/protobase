import Capacitor
import UIKit

/**
 * Opens an `http` or `https` URL outside the app, in the app the phone opens links with, such as a notification's url
 * on another origin. Never a navigation of the WebView, which would load the page inside the app.
 */
@objc(ProtobaseExternal)
public class ProtobaseExternal: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProtobaseExternal"
    public let jsName = "ProtobaseExternal"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)]

    @objc func open(_ call: CAPPluginCall) {
        guard let url = ExternalUrl.allowed(call.getString("url")) else {
            call.reject("ProtobaseExternal opens an absolute http or https URL only")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                if opened { call.resolve() } else { call.reject("No app opens \(url.scheme ?? "") links", "NO_BROWSER") }
            }
        }
    }
}
