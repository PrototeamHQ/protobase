package net.protobase.mobile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginConfig;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin;
import java.lang.reflect.Method;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;

/**
 * Takes the stock LiveUpdate plugin's (8.7.1) place, so page script cannot steer the live updater. The CLI lists this
 * class in capacitor.plugins.json instead of the stock one: listed beside it, two instances would each run their own
 * rollback timer (LiveUpdate.java:147-171). Capacitor reaches only the methods a class's own overrides annotate
 * (PluginHandle.java:145-157), so this subclass decides what page script reaches and keeps the stock lifecycle.
 *
 * - Every reachable method is declared here or by Capacitor's Plugin; load() refuses to load otherwise, so a plugin
 *   upgrade that adds a method leaves no LiveUpdate at all rather than an open one.
 * - The methods the shell needs that take no input clear what page script passed before the stock code reads it.
 * - downloadBundle takes only a manifest from the app's own releases URL, `releasesUrl + "/" + bundleId`, over https
 *   or loopback http, with `publicKey` pinned, so the stock code checks each file's signature (LiveUpdate.java:1633-1654)
 *   and a caller's checksum and signature are dropped. A few per run of the app, so a loop cannot drain the data plan.
 * - Ids are a single safe component naming a direct child of the bundles folder: the stock code joins them to its path
 *   unchecked (LiveUpdate.java:665-667,1299-1302).
 * - Everything else is refused: deleting, resetting, the vendor's cloud, config, channel and ids.
 * - load() also refuses background updates, which sync with the vendor's cloud outside every method here
 *   (LiveUpdate.java:420-433), and needs `autoDeleteBundles` and a `readyTimeout`, so ready() drops every bundle but the
 *   current and next one and a bundle that never gets ready rolls back: page script cannot pin an older one.
 *
 * The config comes from capacitor.config.json, which ships in the binary outside the web part, beyond page script and
 * a live update. This source set compiles only when the app has the plugin's Gradle project, which the CLI's swap and
 * the build's plugin-list check take from the same list (@capacitor/cli android/update.js:20-36).
 */
@CapacitorPlugin(name = "LiveUpdate")
public class GuardedLiveUpdate extends LiveUpdatePlugin {

    private static final int MAX_DOWNLOADS = 3;
    private static final AtomicInteger downloads = new AtomicInteger();

    @Override
    public void load() {
        for (Method method : getClass().getMethods()) {
            if (!method.isAnnotationPresent(PluginMethod.class)) continue;
            Class<?> declaring = method.getDeclaringClass();
            if (declaring == GuardedLiveUpdate.class || declaring == Plugin.class) continue;
            refuseToLoad("LiveUpdate." + method.getName() + " has no guard in this Protobase app");
        }
        PluginConfig config = getConfig();
        if (!"none".equals(config.getString("autoUpdateStrategy", "none"))) {
            refuseToLoad("plugins.LiveUpdate.autoUpdateStrategy must be \"none\" in a Protobase app");
        }
        if (!config.getBoolean("autoDeleteBundles", false)) {
            refuseToLoad("plugins.LiveUpdate.autoDeleteBundles must be true in a Protobase app");
        }
        if (config.getInt("readyTimeout", 0) <= 0) {
            refuseToLoad("plugins.LiveUpdate.readyTimeout must be above 0 in a Protobase app");
        }
        super.load();
    }

    // Capacitor then leaves the plugin unregistered, logging only that it failed to load (PluginHandle.java:98-109), so
    // the reason is logged here.
    private static void refuseToLoad(String reason) {
        Logger.error(reason);
        throw new IllegalStateException(reason);
    }

    // Guarded

    @Override
    @PluginMethod
    public void downloadBundle(PluginCall call) {
        String releasesUrl = getConfig().getString("releasesUrl");
        String publicKey = getConfig().getString("publicKey");
        if (!ownSource(releasesUrl) || publicKey == null || publicKey.trim().isEmpty()) {
            Refusal.rejectMethod(call, "LiveUpdate", "downloadBundle");
            return;
        }
        String bundleId = call.getString("bundleId");
        boolean allowed =
            "manifest".equals(call.getString("artifactType")) &&
            BundlesFolder.isBundleId(BundlesFolder.of(getContext()), bundleId) &&
            (releasesUrl + "/" + bundleId).equals(call.getString("url"));
        if (!allowed) {
            Refusal.rejectMethod(call, "LiveUpdate", "downloadBundle");
            return;
        }
        if (downloads.incrementAndGet() > MAX_DOWNLOADS) {
            call.reject("LiveUpdate.downloadBundle was called too often in this run of the app");
            return;
        }
        JSObject data = clear(call);
        data.put("artifactType", "manifest");
        data.put("bundleId", bundleId);
        data.put("url", releasesUrl + "/" + bundleId);
        super.downloadBundle(call);
    }

    @Override
    @PluginMethod
    public void setNextBundle(PluginCall call) {
        Object bundleId = call.getData().opt("bundleId");
        if (bundleId == null || bundleId == JSONObject.NULL) {
            // The stock code resets to the built-in bundle.
            clear(call);
            super.setNextBundle(call);
            return;
        }
        if (!(bundleId instanceof String) || !BundlesFolder.isBundleId(BundlesFolder.of(getContext()), (String) bundleId)) {
            Refusal.rejectMethod(call, "LiveUpdate", "setNextBundle");
            return;
        }
        clear(call).put("bundleId", bundleId);
        super.setNextBundle(call);
    }

    // Allowed: no input

    @Override
    @PluginMethod
    public void ready(PluginCall call) {
        clear(call);
        super.ready(call);
    }

    @Override
    @PluginMethod
    public void reload(PluginCall call) {
        clear(call);
        super.reload(call);
    }

    @Override
    @PluginMethod
    public void getCurrentBundle(PluginCall call) {
        clear(call);
        super.getCurrentBundle(call);
    }

    @Override
    @PluginMethod
    public void getNextBundle(PluginCall call) {
        clear(call);
        super.getNextBundle(call);
    }

    @Override
    @PluginMethod
    public void getDownloadedBundles(PluginCall call) {
        clear(call);
        super.getDownloadedBundles(call);
    }

    @Override
    @PluginMethod
    public void getVersionCode(PluginCall call) {
        clear(call);
        super.getVersionCode(call);
    }

    @Override
    @PluginMethod
    public void getVersionName(PluginCall call) {
        clear(call);
        super.getVersionName(call);
    }

    // Refused

    @Override
    @PluginMethod
    public void clearBlockedBundles(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "clearBlockedBundles");
    }

    @Override
    @PluginMethod
    public void deleteBundle(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "deleteBundle");
    }

    @Override
    @PluginMethod
    public void fetchChannels(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "fetchChannels");
    }

    @Override
    @PluginMethod
    public void fetchLatestBundle(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "fetchLatestBundle");
    }

    @Override
    @PluginMethod
    public void getBlockedBundles(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "getBlockedBundles");
    }

    @Override
    @PluginMethod
    public void getBundles(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "getBundles");
    }

    @Override
    @PluginMethod
    public void getChannel(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "getChannel");
    }

    @Override
    @PluginMethod
    public void getConfig(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "getConfig");
    }

    @Override
    @PluginMethod
    public void getCustomId(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "getCustomId");
    }

    @Override
    @PluginMethod
    public void getDeviceId(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "getDeviceId");
    }

    @Override
    @PluginMethod
    public void isSyncing(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "isSyncing");
    }

    @Override
    @PluginMethod
    public void reset(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "reset");
    }

    @Override
    @PluginMethod
    public void resetConfig(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "resetConfig");
    }

    @Override
    @PluginMethod
    public void setChannel(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "setChannel");
    }

    @Override
    @PluginMethod
    public void setConfig(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "setConfig");
    }

    @Override
    @PluginMethod
    public void setCustomId(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "setCustomId");
    }

    @Override
    @PluginMethod
    public void sync(PluginCall call) {
        Refusal.rejectMethod(call, "LiveUpdate", "sync");
    }

    // https, or http to the device itself, where no one sits on the path; a bare origin and path only.
    private static boolean ownSource(String releasesUrl) {
        if (releasesUrl == null) return false;
        URI uri;
        try {
            uri = new URI(releasesUrl);
        } catch (URISyntaxException e) {
            return false;
        }
        if (uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) return false;
        if ("https".equals(uri.getScheme())) return true;
        return "http".equals(uri.getScheme()) && Arrays.asList("localhost", "127.0.0.1", "[::1]").contains(uri.getHost());
    }

    // The live data the stock code reads (PluginCall.java:150-152), emptied: keys collected first, then removed.
    private static JSObject clear(PluginCall call) {
        JSObject data = call.getData();
        List<String> keys = new ArrayList<>();
        for (Iterator<String> it = data.keys(); it.hasNext(); ) keys.add(it.next());
        for (String key : keys) data.remove(key);
        return data;
    }
}
