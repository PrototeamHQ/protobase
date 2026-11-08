package net.protobase.mobile;

import java.net.URI;
import java.net.URISyntaxException;

/**
 * What a workspace page may ask of the shell, posted as a string to `protobaseApp.postMessage`. Taken only from the
 * main frame of the workspace's own origin; anything else, or any other frame, is refused (null). The object exists
 * only in frames of that origin (WorkspaceWebView), so this is the second check, not the only one.
 */
enum WorkspaceMessage {
    /** The page's workspace button: show the workspace list. */
    OPEN_DRAWER("openDrawer");

    static final String OBJECT_NAME = "protobaseApp";

    final String name;

    WorkspaceMessage(String name) {
        this.name = name;
    }

    /** The message `body` names, when it comes from the main frame of the workspace's origin; otherwise null. */
    static WorkspaceMessage accept(String body, boolean mainFrame, String sourceOrigin, String workspace) {
        if (!mainFrame || body == null || sourceOrigin == null) return null;
        URI source;
        try {
            source = new URI(sourceOrigin);
        } catch (URISyntaxException e) {
            return null;
        }
        if (source.getHost() == null || !SameOrigin.matches(source, URI.create(workspace))) return null;
        for (WorkspaceMessage message : values()) {
            if (message.name.equals(body)) return message;
        }
        return null;
    }
}
