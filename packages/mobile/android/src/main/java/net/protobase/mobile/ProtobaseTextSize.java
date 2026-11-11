package net.protobase.mobile;

import android.content.res.Configuration;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page's text at the phone's text size: the WebView zooms text by 100% whatever the system's font size, so the
 * shell sets its text zoom to the system's font scale when it loads and when the scale changes.
 */
@CapacitorPlugin(name = "ProtobaseTextSize")
public class ProtobaseTextSize extends Plugin {

    @Override
    public void load() {
        apply(getContext().getResources().getConfiguration());
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        apply(newConfig);
    }

    private void apply(Configuration config) {
        int percent = Math.round(config.fontScale * 100);
        getBridge().executeOnMainThread(() -> getBridge().getWebView().getSettings().setTextZoom(percent));
    }
}
