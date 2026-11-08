import Foundation
import Network

/**
 * A web server on the simulator's loopback for the workspace view tests: each request gets the page `pages` names for
 * its path, or a 404, and one connection serves one request. The request's Cookie header is in `{cookie}` of a page.
 */
final class TestSite {
    struct Page {
        var body: String
        var headers: [String: String] = [:]
    }

    private(set) var port: UInt16 = 0
    private let listener: NWListener
    private let queue = DispatchQueue(label: "net.protobase.mobile.test-site")
    private let pages: [String: Page]

    init(_ pages: [String: Page]) throws {
        self.pages = pages
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { if case .ready = $0 { ready.signal() } }
        listener.newConnectionHandler = { [weak self] connection in self?.serve(connection) }
        listener.start(queue: queue)
        guard ready.wait(timeout: .now() + 10) == .success, let port = listener.port?.rawValue else { throw URLError(.cannotConnectToHost) }
        self.port = port
    }

    /** Stops listening. */
    func close() {
        listener.cancel()
    }

    /** Starts reading a new connection. */
    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        read(connection, Data())
    }

    /** Reads until the request's head is in, then answers it and closes the connection. */
    private func read(_ connection: NWConnection, _ received: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, _ in
            guard let self else { return connection.cancel() }
            let request = received + (data ?? Data())
            guard let text = String(data: request, encoding: .utf8), text.contains("\r\n\r\n") else {
                return done ? connection.cancel() : self.read(connection, request)
            }
            connection.send(content: self.answer(text), completion: .contentProcessed { _ in connection.cancel() })
        }
    }

    /** The response for the request's path: its page, or a 404. */
    private func answer(_ request: String) -> Data {
        let lines = request.components(separatedBy: "\r\n")
        let target = lines[0].split(separator: " ").dropFirst().first.map(String.init) ?? "/"
        let path = target.split(separator: "?").first.map(String.init) ?? "/"
        let cookie = lines.first { $0.lowercased().hasPrefix("cookie:") }.map { String($0.dropFirst(7)).trimmingCharacters(in: .whitespaces) } ?? ""
        guard let page = pages[path] else { return Data("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8) }
        let body = Data(page.body.replacingOccurrences(of: "{cookie}", with: cookie).utf8)
        let headers = page.headers.merging(["Content-Type": "text/html; charset=utf-8", "Content-Length": "\(body.count)", "Connection": "close", "Cache-Control": "no-store"]) { mine, _ in mine }
        let head = "HTTP/1.1 200 OK\r\n" + headers.map { "\($0.key): \($0.value)\r\n" }.joined() + "\r\n"
        return Data(head.utf8) + body
    }
}
