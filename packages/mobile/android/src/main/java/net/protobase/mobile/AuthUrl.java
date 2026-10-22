package net.protobase.mobile;

import java.net.MalformedURLException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URL;
import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Whether ProtobaseAuth may call a URL: one below the auth base path of the API origin, as the shell's
 * nativeAuthFetch checks it. Parsed by URI and by URL, which HttpRequestHandler opens it with, and both must agree;
 * dot segments and an encoded dot, slash or backslash are refused, since the server's URL parser decodes `%2e%2e`
 * into `..`.
 */
final class AuthUrl {

    /** Where Better Auth's endpoints are served, as packages/schema/src/auth-base-path.ts names it. */
    static final String AUTH_BASE_PATH = "/api/auth";

    private static final Pattern ENCODED_DOT_OR_SEPARATOR = Pattern.compile("%(2e|2f|5c)", Pattern.CASE_INSENSITIVE);

    private AuthUrl() {}

    /** The parts both parsers agree on. */
    private static final class Parts {

        final String scheme;
        final String host;
        final int port;
        final String path;

        Parts(String scheme, String host, int port, String path) {
            this.scheme = scheme;
            this.host = host;
            this.port = port;
            this.path = path;
        }
    }

    static boolean allowed(String url, String apiOrigin) {
        Parts origin = parse(apiOrigin);
        Parts target = parse(url);
        if (origin == null || target == null || !origin.path.isEmpty()) return false;
        if (!target.scheme.equals(origin.scheme) || !target.host.equals(origin.host) || target.port != origin.port) return false;
        String path = target.path;
        if (!path.startsWith(AUTH_BASE_PATH + "/") || path.contains("\\") || ENCODED_DOT_OR_SEPARATOR.matcher(path).find()) return false;
        return Arrays.stream(path.split("/")).noneMatch((segment) -> segment.equals(".") || segment.equals(".."));
    }

    // `null` when the parsers disagree, or the URL is not plain http or https.
    private static Parts parse(String text) {
        URI uri;
        URL url;
        try {
            uri = new URI(text);
            url = new URL(text);
        } catch (URISyntaxException | MalformedURLException e) {
            return null;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) return null;
        if (uri.getHost() == null || uri.getRawUserInfo() != null || url.getUserInfo() != null || uri.getRawPath() == null) return null;
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        int port = uri.getPort() == -1 ? (scheme.equals("https") ? 443 : 80) : uri.getPort();
        int urlPort = url.getPort() == -1 ? url.getDefaultPort() : url.getPort();
        boolean agree = url.getProtocol().equalsIgnoreCase(scheme) && url.getHost().equalsIgnoreCase(host) && urlPort == port && url.getPath().equals(uri.getRawPath());
        return agree ? new Parts(scheme, host, port, uri.getRawPath()) : null;
    }
}
