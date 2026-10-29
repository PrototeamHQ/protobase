import Foundation

/** Where a download takes a release's files from: `releasesUrl/<id>?href=<file>`, at most `limit` bytes, in chunks. */
protocol ReleaseSource {
    func fetch(bundleId: String, href: String, limit: Int64, into sink: @escaping (Data) throws -> Void) throws
}

/** A release could not be fetched: the connection failed or timed out. */
struct ReleaseFetchFailed: Error {}

/**
 * Fetches a release's file from the app's own releases URL over a session of its own, with no cache or cookies: only a
 * 200 of the releases URL itself is an answer, a redirect is never followed, and the transfer stops the moment it
 * passes its limit. Blocks its caller, which must not be the main thread, until the file is in or refused.
 */
final class ReleaseFetch: ReleaseSource {
    private static let requestTimeout: TimeInterval = 30
    private static let resourceTimeout: TimeInterval = 600
    // RFC 3986's unreserved characters; every other byte of an href is percent-encoded, a space as %20.
    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    private let releasesUrl: String
    private let configuration: URLSessionConfiguration

    init(releasesUrl: String, configuration: URLSessionConfiguration = .ephemeral) {
        self.releasesUrl = releasesUrl
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForRequest = Self.requestTimeout
        configuration.timeoutIntervalForResource = Self.resourceTimeout
        self.configuration = configuration
    }

    func url(bundleId: String, href: String) -> URL? {
        guard let query = href.addingPercentEncoding(withAllowedCharacters: Self.unreserved) else { return nil }
        return URL(string: releasesUrl + "/" + bundleId + "?href=" + query)
    }

    func fetch(bundleId: String, href: String, limit: Int64, into sink: @escaping (Data) throws -> Void) throws {
        guard let url = url(bundleId: bundleId, href: href) else { throw BundleRefused("its \(href) has no address") }
        let transfer = Transfer(href: href, limit: limit, sink: sink)
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: configuration, delegate: transfer, delegateQueue: queue)
        session.dataTask(with: url).resume()
        transfer.done.wait()
        session.invalidateAndCancel()
        if let failure = transfer.failure { throw failure }
    }
}

/** One fetch's state, read and written only on its session's serial delegate queue until `done` is signalled. */
private final class Transfer: NSObject, URLSessionDataDelegate {
    let href: String
    let limit: Int64
    let sink: (Data) throws -> Void
    let done = DispatchSemaphore(value: 0)
    var received: Int64 = 0
    var failure: Error?

    init(href: String, limit: Int64, sink: @escaping (Data) throws -> Void) {
        self.href = href
        self.limit = limit
        self.sink = sink
    }

    // A redirect is no answer: with nil the 3xx itself arrives as the response, which is refused below.
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200 { return completionHandler(.allow) }
        failure = BundleRefused("the server answered \(status) for \(href)")
        completionHandler(.cancel)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        if failure != nil { return }
        received += Int64(data.count)
        if received > limit {
            failure = BundleRefused("its \(href) is larger than \(limit) bytes")
            return dataTask.cancel()
        }
        do {
            try sink(data)
        } catch {
            failure = error
            dataTask.cancel()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if failure == nil && error != nil { failure = ReleaseFetchFailed() }
        done.signal()
    }
}
