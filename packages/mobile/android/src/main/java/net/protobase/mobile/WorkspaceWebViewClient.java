package net.protobase.mobile;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Collections;
import java.util.function.Consumer;

/**
 * Holds a workspace view to WorkspaceNavigation. Android asks about every main-frame navigation and redirect but a
 * POST, and about a frame only for a scheme other than `http` and `https`; a URL for the system browser goes to
 * `openExternally`. A main-frame request for another origin that reaches the network anyway, such as a form's POST,
 * gets an empty 204, so the view stays on the page it had.
 */
final class WorkspaceWebViewClient extends WebViewClient {

    private final String workspace;
    private final Consumer<String> openExternally;

    WorkspaceWebViewClient(String workspace, Consumer<String> openExternally) {
        this.workspace = workspace;
        this.openExternally = openExternally;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        WorkspaceNavigation.Decision decision = WorkspaceNavigation.decide(url, request.isForMainFrame(), "GET", workspace);
        if (decision == WorkspaceNavigation.Decision.OPEN_EXTERNALLY) openExternally.accept(url);
        return decision != WorkspaceNavigation.Decision.LOAD;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (!request.isForMainFrame() || ownOrigin(request.getUrl().toString())) return null;
        return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private boolean ownOrigin(String url) {
        try {
            return SameOrigin.matches(new URI(url), URI.create(workspace));
        } catch (URISyntaxException e) {
            return false;
        }
    }
}
