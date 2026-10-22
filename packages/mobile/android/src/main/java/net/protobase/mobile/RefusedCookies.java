package net.protobase.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Takes the place of Capacitor's CapacitorCookies, which lets page script write and delete any cookie in the device's
 * jar: plant another session or clear the user's. Replaced by name as RefusedHttp is. The stock plugin's load() has
 * already installed the cookie handler native HTTP keeps the session with (CapacitorCookies.java:21-28).
 */
@CapacitorPlugin(name = "CapacitorCookies")
public class RefusedCookies extends Plugin {

    @Override
    public void load() {
        getBridge().getWebView().removeJavascriptInterface("CapacitorCookiesAndroidInterface");
    }

    @PluginMethod
    public void getCookies(PluginCall call) {
        Refusal.reject(call, "CapacitorCookies");
    }

    @PluginMethod
    public void setCookie(PluginCall call) {
        Refusal.reject(call, "CapacitorCookies");
    }

    @PluginMethod
    public void deleteCookie(PluginCall call) {
        Refusal.reject(call, "CapacitorCookies");
    }

    @PluginMethod
    public void clearCookies(PluginCall call) {
        Refusal.reject(call, "CapacitorCookies");
    }

    @PluginMethod
    public void clearAllCookies(PluginCall call) {
        Refusal.reject(call, "CapacitorCookies");
    }
}
