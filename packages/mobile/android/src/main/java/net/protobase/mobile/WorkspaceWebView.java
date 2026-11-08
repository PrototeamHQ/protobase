package net.protobase.mobile;

import android.content.Context;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Set;
import java.util.function.Consumer;

/**
 * A workspace's own WebView: on the profile its id names, so its cookies, storage and cache are its own; with no
 * Capacitor bridge, only the `protobaseApp` object, which only frames of the workspace's origin get and only its main
 * frame is heard on (WorkspaceMessage); held to WorkspaceNavigation; with no file or content access; and with
 * `ProtobaseApp/1` at the end of its user agent, as Capacitor appends `appendUserAgent`, so the page can tell it runs
 * in the shell. Made only where the WebView has profiles and message listeners (`supported`).
 */
final class WorkspaceWebView {

    static final String USER_AGENT_TOKEN = "ProtobaseApp/1";

    private WorkspaceWebView() {}

    static boolean supported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE) && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
    }

    /** Made on the main thread; null for a workspace whose origin no longer parses. */
    static WebView make(Context context, Workspace workspace, Consumer<String> openExternally, Consumer<WorkspaceMessage> onMessage) {
        String origin = WorkspaceOrigin.parse(workspace.origin);
        if (origin == null) return null;
        WebView view = new WebView(context);
        // Before anything else touches the view, as setProfile requires.
        WebViewCompat.setProfile(view, workspace.id);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " " + USER_AGENT_TOKEN);
        WebViewCompat.addWebMessageListener(view, WorkspaceMessage.OBJECT_NAME, Set.of(origin), (from, message, sourceOrigin, isMainFrame, reply) -> {
            WorkspaceMessage accepted = WorkspaceMessage.accept(message.getData(), isMainFrame, sourceOrigin.toString(), origin);
            if (accepted != null) onMessage.accept(accepted);
        });
        view.setWebViewClient(new WorkspaceWebViewClient(origin, openExternally));
        return view;
    }
}
