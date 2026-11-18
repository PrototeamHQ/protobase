package net.protobase.mobile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;

/** The app's own releases URL, `plugins.LiveUpdate.releasesUrl`, which the live updater downloads from. */
final class ReleasesUrl {

    private ReleasesUrl() {}

    /**
     * Whether `url` is a bare origin and path over https, or, in a debuggable build alone, which is what
     * `protobase mobile run` installs, over plain http to the device itself, where no one sits on the path.
     */
    static boolean isOwnSource(String url, boolean debuggable) {
        if (url == null) return false;
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            return false;
        }
        if (uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) return false;
        if ("https".equals(uri.getScheme())) return true;
        if (!debuggable) return false;
        return "http".equals(uri.getScheme()) && Arrays.asList("localhost", "127.0.0.1", "[::1]").contains(uri.getHost());
    }
}
