package net.protobase.mobile;

import com.getcapacitor.JSObject;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;

/**
 * The request headers ProtobaseAuth sends of those page script gives: the string-valued ones, without the Fetch spec's
 * forbidden request header names, which a page's Request never carries. So page script cannot set the cookie, the
 * origin, or the host a shared ingress routes by, nor override the method.
 */
final class AuthHeaders {

    private static final Set<String> FORBIDDEN = new HashSet<>(
        Arrays.asList(
            "accept-charset",
            "accept-encoding",
            "access-control-request-headers",
            "access-control-request-method",
            "connection",
            "content-length",
            "cookie",
            "cookie2",
            "date",
            "dnt",
            "expect",
            "host",
            "keep-alive",
            "origin",
            "referer",
            "set-cookie",
            "te",
            "trailer",
            "transfer-encoding",
            "upgrade",
            "via",
            "x-http-method",
            "x-http-method-override",
            "x-method-override"
        )
    );

    private AuthHeaders() {}

    static JSObject allowed(JSONObject given) {
        JSObject headers = new JSObject();
        if (given == null) return headers;
        Iterator<String> names = given.keys();
        while (names.hasNext()) {
            String name = names.next();
            Object value = given.opt(name);
            if (value instanceof String && !forbidden(name)) headers.put(name, (String) value);
        }
        return headers;
    }

    private static boolean forbidden(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return FORBIDDEN.contains(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-");
    }
}
