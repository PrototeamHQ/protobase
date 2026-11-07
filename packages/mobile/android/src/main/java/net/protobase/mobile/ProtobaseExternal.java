package net.protobase.mobile;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens an `http` or `https` URL outside the app, in the app the phone opens links with, such as a notification's url
 * on another origin. Never a navigation of the WebView: Capacitor sends a navigation outside the WebView only for
 * another host or scheme (Bridge.java launchIntent), so another port of the WebView's own host would load inside it.
 */
@CapacitorPlugin(name = "ProtobaseExternal")
public class ProtobaseExternal extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (!ExternalUrl.allowed(url)) {
            call.reject("ProtobaseExternal opens an absolute http or https URL only");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            call.reject("No app opens " + Uri.parse(url).getScheme() + " links", "NO_BROWSER", e);
            return;
        }
        call.resolve();
    }
}
