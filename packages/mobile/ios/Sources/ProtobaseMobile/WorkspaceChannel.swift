import WebKit

/** A workspace view's only way to native code: hands on the messages WorkspaceMessage accepts, and drops the rest. */
final class WorkspaceChannel: NSObject, WKScriptMessageHandler {
    private let workspace: URL
    private let onMessage: (WorkspaceMessage) -> Void

    init(workspace: URL, onMessage: @escaping (WorkspaceMessage) -> Void) {
        self.workspace = workspace
        self.onMessage = onMessage
    }

    /** Hands on a message WorkspaceMessage accepts from the frame that posted it. */
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard let accepted = WorkspaceMessage.accept(message.body, mainFrame: message.frameInfo.isMainFrame, scheme: origin.protocol, host: origin.host, port: origin.port, workspace: workspace) else { return }
        onMessage(accepted)
    }
}
