package net.protobase.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Takes the place of Capacitor's WebView plugin, which lets page script point the app's local server at any folder,
 * and keep it there across launches (WebView.java:17-48). Replaced by name as RefusedHttp is. The live updater sets
 * the server's folder on the bridge itself, not through this plugin.
 */
@CapacitorPlugin(name = "WebView")
public class RefusedWebView extends Plugin {

    @PluginMethod
    public void setServerAssetPath(PluginCall call) {
        Refusal.reject(call, "WebView");
    }

    @PluginMethod
    public void setServerBasePath(PluginCall call) {
        Refusal.reject(call, "WebView");
    }

    @PluginMethod
    public void getServerBasePath(PluginCall call) {
        Refusal.reject(call, "WebView");
    }

    @PluginMethod
    public void persistServerBasePath(PluginCall call) {
        Refusal.reject(call, "WebView");
    }
}
