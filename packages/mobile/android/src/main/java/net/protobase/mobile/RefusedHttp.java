package net.protobase.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Takes the place of Capacitor's CapacitorHttp, whose answers hand page script every response header, the session's
 * Set-Cookie included, for any request it makes with the device's cookie jar. Capacitor 8.5.3 registers its core
 * plugins first and an app's plugins after them under the same map, keyed by name only (Bridge.java:660-668,711), so
 * this one replaces it. Native code keeps HttpRequestHandler, which ProtobaseAuth uses.
 */
@CapacitorPlugin(name = "CapacitorHttp")
public class RefusedHttp extends Plugin {

    @Override
    public void load() {
        // Added by the stock plugin's load(), which already ran; plugins load before the first page.
        getBridge().getWebView().removeJavascriptInterface("CapacitorHttpAndroidInterface");
    }

    @PluginMethod
    public void request(PluginCall call) {
        Refusal.reject(call, "CapacitorHttp");
    }

    @PluginMethod
    public void get(PluginCall call) {
        Refusal.reject(call, "CapacitorHttp");
    }

    @PluginMethod
    public void post(PluginCall call) {
        Refusal.reject(call, "CapacitorHttp");
    }

    @PluginMethod
    public void put(PluginCall call) {
        Refusal.reject(call, "CapacitorHttp");
    }

    @PluginMethod
    public void patch(PluginCall call) {
        Refusal.reject(call, "CapacitorHttp");
    }

    @PluginMethod
    public void delete(PluginCall call) {
        Refusal.reject(call, "CapacitorHttp");
    }
}
