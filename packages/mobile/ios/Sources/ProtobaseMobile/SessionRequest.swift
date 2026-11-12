import Foundation

/**
 * Sends one sign-in request with the session's cookies from SessionStore and keeps what its answer sets there, never in
 * the device's cookie jar or the WebView's, which a backup carries. Requests go one at a time, so two answers cannot
 * each keep their own copy of the cookies and lose the other's.
 */
enum SessionRequest {
    private static let queue = DispatchQueue(label: "net.protobase.mobile.session")

    /** A session that neither reads nor saves any cookie jar. */
    static func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        return configuration
    }

    static func send(
        _ request: URLRequest,
        store: SessionStore,
        delegate: URLSessionDelegate?,
        configuration: URLSessionConfiguration = configuration(),
        completion: @escaping (Result<(Data?, HTTPURLResponse), Error>) -> Void
    ) {
        queue.async {
            completion(Result { try exchange(request, store: store, delegate: delegate, configuration: configuration) })
        }
    }

    private struct NoHttpAnswer: LocalizedError {
        var errorDescription: String? { "ProtobaseAuth got no HTTP answer" }
    }

    private static func exchange(_ given: URLRequest, store: SessionStore, delegate: URLSessionDelegate?, configuration: URLSessionConfiguration) throws -> (Data?, HTTPURLResponse) {
        guard let url = given.url else { throw URLError(.badURL) }
        let cookies = try store.load()
        var request = given
        request.httpShouldHandleCookies = false
        request.setValue(cookies.header(for: url), forHTTPHeaderField: "Cookie")

        var outcome: (Data?, URLResponse?, Error?) = (nil, nil, nil)
        let done = DispatchSemaphore(value: 0)
        // The session holds its delegate until it is invalidated.
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        session.dataTask(with: request) { data, response, error in
            outcome = (data, response, error)
            done.signal()
        }.resume()
        done.wait()
        session.invalidateAndCancel()

        if let error = outcome.2 { throw error }
        guard let response = outcome.1 as? HTTPURLResponse else { throw NoHttpAnswer() }
        try store.save(cookies.received(response, for: url))
        return (outcome.0, response)
    }
}
