package net.protobase.mobile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;

/**
 * A workspace's address as the shell keeps it: an `https` origin, or an `http` one on a loopback host (`localhost`,
 * `127.0.0.1`), the hosts a browser counts as a secure context. Written as `scheme://host[:port]`, scheme and host in
 * lower case and a default port left out. Refused (null): any other scheme or host, credentials, a path other than
 * `/`, a query or a fragment.
 */
final class WorkspaceOrigin {

    private static final Set<String> LOOPBACK_HOSTS = Set.of("localhost", "127.0.0.1");

    private WorkspaceOrigin() {}

    static String parse(String text) {
        if (text == null) return null;
        URI uri;
        try {
            uri = new URI(text);
        } catch (URISyntaxException e) {
            return null;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.isEmpty() || !(scheme.equals("https") || (scheme.equals("http") && LOOPBACK_HOSTS.contains(host)))) return null;
        String path = uri.getRawPath() == null ? "" : uri.getRawPath();
        if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || !(path.isEmpty() || path.equals("/"))) return null;
        boolean defaultPort = uri.getPort() == -1 || uri.getPort() == SameOrigin.defaultPort(scheme);
        return scheme + "://" + host + (defaultPort ? "" : ":" + uri.getPort());
    }
}
