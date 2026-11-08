package net.protobase.mobile;

import java.net.URI;
import java.util.Locale;

/**
 * Whether a URL is of an origin: the same scheme and host, ignoring case, and the same port, an absent port counting
 * as the scheme's default. A workspace view checks every navigation with it, as PageScriptFilter checks a frame on iOS.
 */
final class SameOrigin {

    private SameOrigin() {}

    /** Whether `url` is of `origin`. */
    static boolean matches(URI url, URI origin) {
        String scheme = lower(url.getScheme());
        return scheme.equals(lower(origin.getScheme())) && lower(url.getHost()).equals(lower(origin.getHost())) && port(url) == port(origin);
    }

    /** The port a URL of `scheme` uses without one: 80 for http, 443 for https, -1 for any other. */
    static int defaultPort(String scheme) {
        switch (scheme) {
            case "http":
                return 80;
            case "https":
                return 443;
            default:
                return -1;
        }
    }

    /** The URL's port, or its scheme's default when it names none. */
    private static int port(URI url) {
        return url.getPort() == -1 ? defaultPort(lower(url.getScheme())) : url.getPort();
    }

    /** The text in lower case, or empty for null. */
    private static String lower(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT);
    }
}
