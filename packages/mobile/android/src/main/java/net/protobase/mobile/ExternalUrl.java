package net.protobase.mobile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Whether ProtobaseExternal may open a URL, as the server's tapUrl and the shell check it: at most 2048 characters with
 * no whitespace or control character, parsed as an absolute `http` or `https` URL with a host.
 */
final class ExternalUrl {

    private static final Pattern PLAIN = Pattern.compile("^[^\\s\\u0000-\\u001f\\u007f-\\u009f]+$");

    private ExternalUrl() {}

    static boolean allowed(String url) {
        if (url == null || url.length() > 2048 || !PLAIN.matcher(url).matches()) return false;
        URI uri;
        try {
            uri = new URI(url);
        } catch (URISyntaxException e) {
            return false;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        return (scheme.equals("https") || scheme.equals("http")) && uri.getHost() != null && !uri.getHost().isEmpty();
    }
}
