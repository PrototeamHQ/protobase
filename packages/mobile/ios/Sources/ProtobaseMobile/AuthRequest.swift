import Capacitor
import Foundation

/**
 * One sign-in request of ProtobaseAuth, checked in the order of Android's ProtobaseAuth.java and sent through
 * Capacitor's own request type, which refuses redirects, with the session's cookies from SessionStore, which stay on
 * this device. The call's options are never handed to Capacitor code, so page script cannot add params, a file body,
 * timeouts or redirects.
 */
enum AuthRequest {
    static func send(_ call: CAPPluginCall, config: PluginConfig) {
        guard let apiOrigin = config.getString("apiOrigin"), let origin = config.getString("origin") else {
            call.reject("ProtobaseAuth has no apiOrigin or origin in its config")
            return
        }
        guard let text = call.options["url"] as? String, let url = AuthUrl.allowed(text, apiOrigin: apiOrigin) else {
            call.reject("ProtobaseAuth calls \(apiOrigin)\(AuthUrl.authBasePath)/ only")
            return
        }
        let method = (call.getString("method") ?? "GET").uppercased()
        // All Better Auth serves.
        guard method == "GET" || method == "POST" else {
            call.reject("ProtobaseAuth sends GET or POST only, not \(method)")
            return
        }
        let data = call.options["data"]
        guard data == nil || data is String else {
            call.reject("ProtobaseAuth sends a text body only")
            return
        }
        let body = data as? String
        // URLSession fails a GET with a body, and the shell never sends one.
        guard body == nil || method == "POST" else {
            call.reject("ProtobaseAuth sends a body with POST only")
            return
        }
        var headers = AuthHeaders.allowed(call.getObject("headers"))
        headers["Origin"] = origin

        let request = CapacitorUrlRequest(url, method: method)
        request.setRequestHeaders(headers)
        if let body { request.request.httpBody = Data(body.utf8) }
        // The request refuses redirects as the session's delegate; the cookies come from and go to SessionStore alone.
        SessionRequest.send(request.getUrlRequest(), store: SessionStore(keychain: DeviceKeychain()), delegate: request) { result in
            switch result {
            case .failure(let error as KeychainError):
                call.reject("ProtobaseAuth cannot reach the session: \(error)")
            case .failure(let error):
                call.reject(error.localizedDescription, (error as NSError).domain, error, nil)
            case .success(let (data, response)):
                var output = HttpRequestHandler.buildResponse(data, response, responseType: .text)
                // Set-Cookie stays native; buildResponse lower-cases the names.
                if var answerHeaders = output["headers"] as? [String: Any] {
                    answerHeaders.removeValue(forKey: "set-cookie")
                    answerHeaders.removeValue(forKey: "set-cookie2")
                    output["headers"] = answerHeaders
                }
                call.resolve(output)
            }
        }
    }
}
