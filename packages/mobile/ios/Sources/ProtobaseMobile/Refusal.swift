import Capacitor

/** How Protobase answers page script that calls a plugin or method it may not reach. */
enum Refusal {
    static func message(_ name: String) -> String {
        "\(name) is not available to page script in a Protobase app"
    }

    static func reject(_ call: CAPPluginCall, plugin: String) {
        call.reject(message("\(plugin).\(call.methodName ?? "")"))
    }
}
