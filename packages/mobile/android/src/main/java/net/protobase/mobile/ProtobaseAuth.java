package net.protobase.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.util.HttpRequestHandler;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * The shell's sign-in requests, through native HTTP and the device's cookie jar, to `<apiOrigin>/api/auth/` only. It
 * names the Capacitor origin of the app, which the server trusts for sign-in, and hands page script no Set-Cookie: the
 * session token stays in the jar. `apiOrigin` and `origin` come from capacitor.config.json, which the CLI writes and
 * ships outside the app's web part, so neither page script nor a live update can change them.
 */
@CapacitorPlugin(name = "ProtobaseAuth")
public class ProtobaseAuth extends Plugin {

    private final ExecutorService executor = Executors.newCachedThreadPool();

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        executor.shutdownNow();
    }

    @PluginMethod
    public void request(PluginCall call) {
        String apiOrigin = getConfig().getString("apiOrigin");
        String origin = getConfig().getString("origin");
        if (apiOrigin == null || origin == null) {
            call.reject("ProtobaseAuth has no apiOrigin or origin in its config");
            return;
        }
        String url = call.getString("url");
        if (url == null || !AuthUrl.allowed(url, apiOrigin)) {
            call.reject("ProtobaseAuth calls " + apiOrigin + AuthUrl.AUTH_BASE_PATH + "/ only");
            return;
        }
        String method = call.getString("method", "GET").toUpperCase(Locale.ROOT);
        // All Better Auth serves.
        if (!method.equals("GET") && !method.equals("POST")) {
            call.reject("ProtobaseAuth sends GET or POST only, not " + method);
            return;
        }
        Object data = call.getData().opt("data");
        if (data != null && !(data instanceof String)) {
            call.reject("ProtobaseAuth sends a text body only");
            return;
        }
        JSObject headers = AuthHeaders.allowed(call.getObject("headers"));
        headers.put("Origin", origin);
        replaceOptions(call.getData(), url, method, headers, (String) data);
        if (executor.isShutdown()) {
            call.reject("ProtobaseAuth was shut down");
            return;
        }
        executor.submit(() -> send(call, method));
    }

    private void send(PluginCall call, String method) {
        // Every failure answers the call, as CapacitorHttp's does: a task's exception would otherwise leave it unanswered.
        try {
            JSObject response = HttpRequestHandler.request(call, method, getBridge());
            removeCookieHeaders(response.optJSONObject("headers"));
            call.resolve(response);
        } catch (Exception e) {
            call.reject(e.getLocalizedMessage(), e.getClass().getSimpleName(), e);
        }
    }

    // HttpRequestHandler reads its options from the call: only the checked ones are left, so page script cannot add
    // params, a file body (`dataType`), timeouts or redirects.
    private static void replaceOptions(JSObject options, String url, String method, JSObject headers, String data) {
        for (String key : keysOf(options)) options.remove(key);
        options.put("url", url);
        options.put("method", method);
        options.put("headers", headers);
        if (data != null) options.put("data", data);
        options.put("responseType", "text");
        options.put("disableRedirects", true);
    }

    private static void removeCookieHeaders(JSONObject headers) {
        if (headers == null) return;
        for (String name : keysOf(headers)) {
            if (name.equalsIgnoreCase("set-cookie") || name.equalsIgnoreCase("set-cookie2")) headers.remove(name);
        }
    }

    // Collected before any is removed, which the iterator does not allow.
    private static List<String> keysOf(JSONObject object) {
        List<String> keys = new ArrayList<>();
        Iterator<String> names = object.keys();
        while (names.hasNext()) keys.add(names.next());
        return keys;
    }
}
