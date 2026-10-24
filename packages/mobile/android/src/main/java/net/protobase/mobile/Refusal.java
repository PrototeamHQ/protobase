package net.protobase.mobile;

import com.getcapacitor.PluginCall;

/** How the stand-ins answer page script that calls a stock plugin they replace. */
final class Refusal {

    private Refusal() {}

    static void reject(PluginCall call, String plugin) {
        call.reject(plugin + " is not available to page script in a Protobase app");
    }

    static void rejectMethod(PluginCall call, String plugin, String method) {
        call.reject(plugin + "." + method + " is not available to page script in a Protobase app");
    }
}
