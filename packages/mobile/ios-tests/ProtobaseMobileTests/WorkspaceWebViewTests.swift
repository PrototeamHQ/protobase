import UIKit
import WebKit
import XCTest
@testable import ProtobaseMobile

/**
 * Workspace views on a simulator, on pages of a loopback server: two workspaces at one origin, each on its own store,
 * so a shared store would show in the second whatever the first set.
 */
@MainActor
final class WorkspaceWebViewTests: XCTestCase {
    private struct Timeout: Error {
        let what: String
    }

    // The frames tell the page they posted; another origin's frame is the same server by another host name.
    private static let pages: [String: TestSite.Page] = [
        "/": .init(body: "<!doctype html><title>home</title>"),
        "/sign-in": .init(
            body: "<!doctype html><script>document.cookie = 'page=a; path=/'; localStorage.setItem('k', 'a')</script>",
            headers: ["Set-Cookie": "session=a; Path=/; HttpOnly"]),
        "/echo": .init(body: "<!doctype html><p id=cookie>{cookie}</p>"),
        "/frames": .init(body: """
            <!doctype html><script>
            window.posted = 0
            addEventListener('message', (event) => { if (event.data === 'posted') window.posted++ })
            for (const src of ['/child', `http://localhost:${location.port}/child`]) {
              const frame = document.createElement('iframe')
              frame.src = src
              document.documentElement.append(frame)
            }
            </script>
            """),
        "/child": .init(body: "<!doctype html><script>try { window.webkit.messageHandlers.protobaseApp.postMessage('openDrawer') } finally { parent.postMessage('posted', '*') }</script>"),
        "/links": .init(body: """
            <!doctype html><a id=out>out</a><a id=after>after</a><form id=post method=post><input name=a value=1></form><script>
            const other = `http://localhost:${location.port}`
            document.getElementById('out').href = `${other}/elsewhere`
            document.getElementById('after').href = `${other}/after`
            document.getElementById('post').action = `${other}/form`
            </script>
            """),
    ]

    private var site: TestSite!
    private var window: UIWindow!
    private var views: [WorkspaceWebView] = []
    private var opened: [String] = []
    private var messages: [WorkspaceMessage] = []

    private var origin: String { "http://127.0.0.1:\(site.port)" }
    private var other: String { "http://localhost:\(site.port)" }

    /** Starts the test site and a window for the views. */
    override func setUp() async throws {
        site = try TestSite(Self.pages)
        window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = UIViewController()
        window.isHidden = false
    }

    /** Closes every view the test made, then the test site. */
    override func tearDown() async throws {
        views.forEach { $0.close() }
        views = []
        site.close()
    }

    /** A cookie and a localStorage value set in workspace A show again in A's store and are absent in workspace B. */
    func testCookiesAndStorageStayInTheirWorkspace() async throws {
        let store = UUID()
        let a = make(store)
        try await go(a, "/sign-in")
        try await go(a, "/echo")
        let cookies = try await js(a, "document.getElementById('cookie').textContent")
        XCTAssertTrue(cookies.contains("session=a") && cookies.contains("page=a"), cookies)
        // A's store in a second view, as its workspace opens after the app restarted: what A set is there, so it has
        // reached the store before B looks.
        let again = make(store)
        try await go(again, "/echo")
        let againCookies = try await js(again, "document.getElementById('cookie').textContent")
        XCTAssertTrue(againCookies.contains("session=a"), againCookies)
        try await until("A's storage shows in its store again") { try await self.js(again, "String(localStorage.getItem('k'))") == "a" }
        let b = make(UUID())
        try await go(b, "/echo")
        let bCookies = try await js(b, "document.getElementById('cookie').textContent + '|' + document.cookie")
        let bStorage = try await js(b, "String(localStorage.getItem('k'))")
        XCTAssertEqual(bCookies, "|")
        XCTAssertEqual(bStorage, "null")
    }

    /** Only the main frame of the workspace's own origin is heard, and only openDrawer reaches native code. */
    func testTheChannelTakesOnlyItsOwnMainFrame() async throws {
        let a = make(UUID())
        try await go(a, "/frames")
        try await until("both frames posted") { try await self.js(a, "String(window.posted)") == "2" }
        _ = try await js(a, "window.webkit.messageHandlers.protobaseApp.postMessage('register'), 'posted'")
        _ = try await js(a, "window.webkit.messageHandlers.protobaseApp.postMessage('openDrawer'), 'posted'")
        try await until("the main frame's message arrived") { !self.messages.isEmpty }
        XCTAssertEqual(messages, [.openDrawer])
    }

    /** Links to another origin open in the system browser and the view stays on its page; a POST there goes nowhere. */
    func testAnotherOriginLeavesForTheSystemBrowser() async throws {
        let a = make(UUID())
        try await go(a, "/links")
        _ = try await js(a, "document.getElementById('out').click(), 'clicked'")
        try await until("the link reached the system browser") { self.opened.count == 1 }
        _ = try await js(a, "document.getElementById('post').submit(), 'submitted'")
        _ = try await js(a, "document.getElementById('after').click(), 'clicked'")
        try await until("the second link reached the system browser") { self.opened.count == 2 }
        // The form's POST to another origin went nowhere: the browser cannot carry its body.
        XCTAssertEqual(opened, ["\(other)/elsewhere", "\(other)/after"])
        let location = try await js(a, "location.href")
        XCTAssertEqual(location, "\(origin)/links")
    }

    /** A workspace view on the data store `store`, for the test site's origin, on screen. */
    private func make(_ store: UUID) -> WorkspaceWebView {
        let workspace = Workspace(id: store.uuidString, origin: origin, name: nil, icon: nil)
        let view = WorkspaceWebView(workspace, openExternally: { [weak self] in self?.opened.append($0.absoluteString) }, onMessage: { [weak self] in self?.messages.append($0) })!
        view.webView.frame = window.bounds
        window.rootViewController!.view.addSubview(view.webView)
        views.append(view)
        return view
    }

    /** Loads `path` of the test site in `view` and waits until it has loaded. */
    private func go(_ view: WorkspaceWebView, _ path: String) async throws {
        view.webView.load(URLRequest(url: URL(string: origin + path)!))
        try await until("\(path) loaded") { try await self.js(view, "location.pathname + '|' + document.readyState") == "\(path)|complete" }
    }

    /** The script's string result; every script ends in a string, since WebKit cannot hand an undefined result to Swift. */
    private func js(_ view: WorkspaceWebView, _ script: String) async throws -> String {
        try await view.webView.evaluateJavaScript(script) as? String ?? ""
    }

    /** Waits until `condition` holds, failing with `what` when it does not in time. */
    private func until(_ what: String, _ condition: @MainActor () async throws -> Bool) async throws {
        let deadline = Date().addingTimeInterval(15)
        while try await !condition() {
            guard Date() < deadline else { throw Timeout(what: what) }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
    }
}
