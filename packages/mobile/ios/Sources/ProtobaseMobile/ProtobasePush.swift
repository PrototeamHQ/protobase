import Capacitor

/**
 * What the iOS app registers its APNs token with: the app's bundle id, the topic APNs sends to, and the APNs
 * environment its push entitlement names, which the CLI writes into capacitor.config.json beside it (`sandbox` for a
 * development build, `production` for a release), outside the app's web part.
 */
@objc(ProtobasePush)
public class ProtobasePush: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProtobasePush"
    public let jsName = "ProtobasePush"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "apns", returnType: CAPPluginReturnPromise)]

    @objc func apns(_ call: CAPPluginCall) {
        guard let environment = getConfig().getString("environment"), ["sandbox", "production"].contains(environment) else {
            call.reject("The app was built without push")
            return
        }
        guard let appId = Bundle.main.bundleIdentifier else {
            call.reject("The app has no bundle id")
            return
        }
        call.resolve(["appId": appId, "environment": environment])
    }
}
