package net.protobase.mobile;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.Objects;

/**
 * Keeps page script from reading the app's files through its local server, which opens any file a request's path
 * names (AndroidProtocolHandler.java:66-87): the WebView's cookie database, with the session token in plain text,
 * lives below the app's data folder. Refused, with an empty 403:
 * - the file and content routes, `/_capacitor_file_` and `/_capacitor_content_`, which Protobase never uses;
 * - a `..` segment in the decoded path the server opens;
 * - while the server serves files from a folder (the live updater's bundle), a path whose file is not inside the
 *   live updater's bundles folder, wherever that folder came from.
 * The decoded path is the one the server reads (WebViewLocalServer.java:236-239,686-689). The server's folder is read
 * again after it answered, so a switch between the check and the read is refused too.
 */
final class GuardedWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final File bundles;

    GuardedWebViewClient(Bridge bridge, File bundles) {
        super(bridge);
        this.bridge = bridge;
        this.bundles = bundles;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String decoded = request.getUrl().getPath();
        String path = decoded == null ? "" : decoded;
        String basePath = bridge.getServerBasePath();
        if (refused(path, basePath)) return forbidden();
        WebResourceResponse response = super.shouldInterceptRequest(view, request);
        // A stream left open here is the garbage collector's to close: it only happens to a request racing a switch.
        if (!Objects.equals(basePath, bridge.getServerBasePath())) return forbidden();
        return response;
    }

    private boolean refused(String path, String basePath) {
        if (path.startsWith(Bridge.CAPACITOR_FILE_START) || path.startsWith(Bridge.CAPACITOR_CONTENT_START)) return true;
        if (Arrays.asList(path.split("/")).contains("..")) return true;
        if (basePath == null || !new File(basePath).isAbsolute()) return false;
        return !BundlesFolder.contains(bundles, new File(basePath + path));
    }

    private static WebResourceResponse forbidden() {
        return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
}
