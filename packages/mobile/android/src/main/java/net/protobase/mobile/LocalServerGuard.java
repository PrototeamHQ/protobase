package net.protobase.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Puts GuardedWebViewClient in front of the app's local server. It has no methods: it only acts when it loads, which
 * is before the first page, since Capacitor 8.5.3 loads plugins before it installs the bridge's WebViewClient on the
 * WebView (Bridge.java:231-233,281).
 */
@CapacitorPlugin(name = "ProtobaseLocalServerGuard")
public class LocalServerGuard extends Plugin {

    // The folder the live updater keeps its bundles in, a fixed name below the app's files (LiveUpdate.java:114).
    private static final String LIVE_UPDATE_BUNDLES = "_capacitor_live_update_bundles";

    @Override
    public void load() {
        getBridge().setWebViewClient(new GuardedWebViewClient(getBridge(), new File(getContext().getFilesDir(), LIVE_UPDATE_BUNDLES)));
    }
}
