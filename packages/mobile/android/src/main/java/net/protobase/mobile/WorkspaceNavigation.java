package net.protobase.mobile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

/**
 * What a workspace view does with a navigation. Its main frame loads only its own origin; a `GET` of another `http` or
 * `https` URL opens in the system browser instead, and anything else is refused: another scheme, a longer URL than a
 * link opens elsewhere (ExternalUrl), and a `POST` to another origin, whose body the browser cannot carry. Frames load
 * as in a browser: `http`, `https` and the schemes pages build frames with; never `file:`, `content:` or a scheme
 * another app handles. New windows stay off, so `target=_blank` and `window.open` arrive as main-frame navigations.
 */
final class WorkspaceNavigation {

    enum Decision {
        LOAD,
        OPEN_EXTERNALLY,
        REFUSE
    }

    private static final Set<String> WEB_SCHEMES = Set.of("http", "https");
    private static final Set<String> FRAME_SCHEMES = Set.of("http", "https", "about", "blob", "data");

    private WorkspaceNavigation() {}

    static Decision decide(String url, boolean mainFrame, String method, String workspace) {
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            return Decision.REFUSE;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!mainFrame) return FRAME_SCHEMES.contains(scheme) ? Decision.LOAD : Decision.REFUSE;
        if (!WEB_SCHEMES.contains(scheme) || uri.getHost() == null) return Decision.REFUSE;
        if (SameOrigin.matches(uri, URI.create(workspace))) return Decision.LOAD;
        if (!method.equalsIgnoreCase("GET") || !ExternalUrl.allowed(url)) return Decision.REFUSE;
        return Decision.OPEN_EXTERNALLY;
    }
}
