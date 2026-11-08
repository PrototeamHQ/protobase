import Capacitor

/**
 * The home view's hold on the workspace views: `list`, `add` (`origin`, and `name` and `icon` if known), `open` and
 * `remove` by id, and `showHome`, which hides the open one. A workspace page's `openDrawer` reaches the home view as the
 * `openDrawer` event with the workspace's `id`. Off unless `plugins.ProtobaseWorkspaces.enabled` is `true`; refused
 * beside the live updater, which this mode does not use, and below iOS 17, which has no data store per workspace.
 * Every app's shell compiles it, so off, every method rejects.
 */
@objc(ProtobaseWorkspacesPlugin)
public class ProtobaseWorkspacesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProtobaseWorkspacesPlugin"
    public let jsName = "ProtobaseWorkspaces"
    public let pluginMethods: [CAPPluginMethod] = ["list", "add", "open", "showHome", "remove"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)! }

    private let workspaces = WorkspaceList()
    private var views: WorkspaceViews?

    /** Answers `{ workspaces }` in the order added, after deleting the data stores of removed workspaces that can go. */
    @objc func list(_ call: CAPPluginCall) {
        run(call) { _, list in
            try await WorkspaceStores.removePending(list)
            call.resolve(["workspaces": try list.all().map(Self.json)])
        }
    }

    /** Lists the workspace at `origin` and answers `{ workspace }`; rejects an origin that does not parse or is already listed. */
    @objc func add(_ call: CAPPluginCall) {
        run(call) { _, list in
            guard let origin = WorkspaceOrigin.parse(call.getString("origin") ?? "") else {
                return call.reject("A workspace's origin is an https origin, or http on localhost or 127.0.0.1, with no path")
            }
            call.resolve(["workspace": Self.json(try list.add(origin: origin, name: call.getString("name"), icon: call.getString("icon")))])
        }
    }

    /** Shows the workspace with `id`, making its view the first time; rejects an unknown id or a view that cannot be made. */
    @objc func open(_ call: CAPPluginCall) {
        run(call) { views, list in
            guard views.show(try list.find(call.getString("id") ?? "")) else { return call.reject("The workspace view cannot open") }
            call.resolve()
        }
    }

    /** Hides the open workspace view, so the home view shows. */
    @objc func showHome(_ call: CAPPluginCall) {
        run(call) { views, _ in
            views.showHome()
            call.resolve()
        }
    }

    /** Closes the workspace's view, drops it from the list and deletes its data store when WebKit lets it. */
    @objc func remove(_ call: CAPPluginCall) {
        run(call) { views, list in
            let id = call.getString("id") ?? ""
            views.close(id)
            try list.remove(id)
            try await WorkspaceStores.removePending(list)
            call.resolve()
        }
    }

    /** Runs a method's body on the main actor once the mode is on, answering a known failure with its own rejection. */
    private func run(_ call: CAPPluginCall, _ body: @escaping @MainActor (WorkspaceViews, WorkspaceList) async throws -> Void) {
        if let refusal = refusal() { return call.reject(refusal) }
        Task { @MainActor in
            do {
                try await body(self.workspaceViews(), self.workspaces)
            } catch let failure as WorkspaceList.Failure {
                call.reject(failure == .listed ? "That workspace is already listed" : "No workspace has that id")
            } catch {
                // Every other failure, such as a list in storage that does not decode, answers the call the same way.
                call.reject("ProtobaseWorkspaces could not read or save its workspaces")
            }
        }
    }

    /** Why the mode cannot run here, or nil when it can. */
    private func refusal() -> String? {
        guard let enabled = WorkspacesSetting.enabled(getConfig().getConfigJSON()["enabled"]) else {
            return "plugins.ProtobaseWorkspaces.enabled takes true or false"
        }
        guard enabled else { return "ProtobaseWorkspaces is off: plugins.ProtobaseWorkspaces.enabled is not true" }
        guard bridge?.plugin(withName: "LiveUpdate") == nil else { return "ProtobaseWorkspaces does not run beside the live updater" }
        guard #available(iOS 17.0, *) else { return "ProtobaseWorkspaces needs iOS 17, which gives each workspace a data store of its own" }
        return nil
    }

    /** The workspace views, made on first use over the bridge's view controller. */
    @MainActor
    private func workspaceViews() -> WorkspaceViews {
        if let views { return views }
        let made = WorkspaceViews(
            container: { [weak self] in self?.bridge?.viewController?.view },
            openExternally: { [weak self] url in SystemBrowser.open(url, from: self?.bridge?.viewController) },
            onMessage: { [weak self] workspace, message in self?.notifyListeners(message.rawValue, data: ["id": workspace.id]) })
        views = made
        return made
    }

    /** The workspace as the plugin answers it, leaving out a missing name or icon. */
    private static func json(_ workspace: Workspace) -> JSObject {
        var object: JSObject = ["id": workspace.id, "origin": workspace.origin]
        if let name = workspace.name { object["name"] = name }
        if let icon = workspace.icon { object["icon"] = icon }
        return object
    }
}
