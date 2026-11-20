import Foundation

/** Where a check asks which release the binary should run, as `ReleaseQuery` does. */
protocol ReleaseAsking {
    /** The server's answer, or nil when it gave none. Blocks its caller, which must not be the main thread. */
    func answer() -> ReleaseAnswer?
}

/**
 * Asks the app's server which release this binary should run, as the shell's release-check.ts does: `GET
 * <api origin>/api/mobile/release?fingerprint=&shell_version=`, public, so with no cookies or cache. Anything but a 200
 * holding the answer, no network or the timeout is no answer.
 */
struct ReleaseQuery: ReleaseAsking {
    static let path = "/api/mobile/release"
    static let timeout: TimeInterval = 15
    private static let maxBytes = 64 * 1024

    let url: URL

    /** The query of the binary `binary` at `apiOrigin`, or nil when they make no address. */
    init?(apiOrigin: String, binary: ReleaseBinary) {
        guard var parts = URLComponents(string: apiOrigin + Self.path) else { return nil }
        parts.queryItems = [URLQueryItem(name: "fingerprint", value: binary.fingerprint), URLQueryItem(name: "shell_version", value: binary.shellVersion)]
        guard let url = parts.url else { return nil }
        self.url = url
    }

    func answer() -> ReleaseAnswer? {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = Self.timeout
        configuration.timeoutIntervalForResource = Self.timeout
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let done = DispatchSemaphore(value: 0)
        var answer: ReleaseAnswer?
        session.dataTask(with: url) { data, response, _ in
            defer { done.signal() }
            guard (response as? HTTPURLResponse)?.statusCode == 200, let data, data.count <= Self.maxBytes else { return }
            answer = ReleaseAnswer.parse(data)
        }.resume()
        done.wait()
        return answer
    }
}
