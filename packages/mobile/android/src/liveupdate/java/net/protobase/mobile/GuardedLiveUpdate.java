package net.protobase.mobile;

import android.app.Activity;
import android.content.res.AssetManager;
import android.content.SharedPreferences;
import android.util.Base64;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginConfig;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.net.URI;
import java.net.URISyntaxException;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

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
 *   or loopback http, and downloads it itself (ReleaseDownload), bound by the release's statement to the id, the pinned
 *   `publicKey`, this binary and its order; a caller's checksum and signature are dropped. A few per run of the app, so
 *   a loop cannot drain the data plan.
 * - Both take a release only above the order of the binary's own files, `builtInOrder`, which the CLI computes as the
 *   server computes a release's, so a reinstalled app cannot be taken below its own files; and neither takes a bundle
 *   the stock code blocked after rolling it back (BlockedBundles), which it checks only in the refused sync().
 * - setNextBundle checks the bundle on disk (BundleCheck), then takes it only above the running bundle's order and not
 *   below the highest the app downloaded; a refused bundle that is neither running nor next is deleted, as the stock
 *   code deletes an unused one (LiveUpdate.java:803-810). It is the only way to a downloaded bundle: reset, sync, a
 *   next bundle of null (the built-in one) and the rest are refused, reload only runs the next bundle and a rollback
 *   goes to the built-in one inside the stock code (LiveUpdate.java:1411).
 * - Ids are a single safe component naming a direct child of the bundles folder: the stock code joins them to its path
 *   unchecked (LiveUpdate.java:665-667,1299-1302).
 * - Everything else is refused: deleting, resetting, the vendor's cloud, config, channel and ids.
 * - load() also refuses background updates, which sync with the vendor's cloud outside every method here
 *   (LiveUpdate.java:420-433), and needs `autoDeleteBundles`, a `readyTimeout` and `autoBlockRolledBackBundles`, so
 *   ready() drops every bundle but the current and next one, and a bundle that never gets ready rolls back and is not
 *   taken again: page script cannot pin an older one.
 *
 * The config comes from capacitor.config.json, which ships in the binary outside the web part, beyond page script and
 * a live update. This source set compiles only when the app has the plugin's Gradle project, which the CLI's swap and
 * the build's plugin-list check take from the same list (@capacitor/cli android/update.js:20-36).
 */
@CapacitorPlugin(name = "LiveUpdate")
public class GuardedLiveUpdate extends LiveUpdatePlugin {

    private static final int MAX_DOWNLOADS = 3;
    private static final AtomicInteger downloads = new AtomicInteger();
    // One download at a time, and one lock over the highest order downloaded and the choice of the next bundle.
    private static final ExecutorService downloader = Executors.newSingleThreadExecutor();
    private static final Object order = new Object();
    // Beside the bundles folder, on the same file system, so a checked download moves into it whole.
    private static final String DOWNLOADS = "_protobase_live_update_downloads";
    private static final String ORDER_PREFS = "ProtobaseLiveUpdate";
    private static final String HIGHEST_ORDER = "highestOrder";

    private String releasesUrl;
    private PublicKey publicKey;
    private ReleaseBinary binary;
    private long[] builtInOrder;

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
        if (!config.getBoolean("autoBlockRolledBackBundles", false)) {
            refuseToLoad("plugins.LiveUpdate.autoBlockRolledBackBundles must be true in a Protobase app");
        }
        builtInOrder = ReleaseOrder.parseBuiltIn(config.getString("builtInOrder"));
        if (builtInOrder == null) {
            refuseToLoad("plugins.LiveUpdate needs the order of the binary's own files, builtInOrder, in a Protobase app: run protobase mobile again");
        }
        releasesUrl = config.getString("releasesUrl");
        if (!ownSource(releasesUrl)) {
            refuseToLoad("plugins.LiveUpdate.releasesUrl must be an https URL, or http to the device itself, in a Protobase app");
        }
        publicKey = rsaKey(config.getString("publicKey"));
        String fingerprint = config.getString("fingerprint");
        String shellVersion = config.getString("shellVersion");
        if (fingerprint == null || !Hex.isHex(fingerprint, 16) || !ReleaseStatement.isVersion(shellVersion)) {
            refuseToLoad("plugins.LiveUpdate needs the binary's fingerprint and shellVersion in a Protobase app: run protobase mobile again");
        }
        binary = new ReleaseBinary(getContext().getPackageName(), fingerprint, shellVersion);
        // What a download the app did not finish left.
        File downloads = new File(getContext().getFilesDir(), DOWNLOADS);
        BundleRemoval.delete(downloads, downloads);
        super.load();
    }

    // The key the releases are signed with: an RSA public key as base64 SPKI DER, with or without PEM's lines, as the
    // stock code reads it (LiveUpdate.java:744-755).
    private static PublicKey rsaKey(String value) {
        if (value == null || value.trim().isEmpty()) refuseToLoad("plugins.LiveUpdate.publicKey must be set in a Protobase app");
        String body = value.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", "");
        try {
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.decode(body, Base64.DEFAULT)));
            if (!(key instanceof RSAPublicKey)) refuseToLoad("plugins.LiveUpdate.publicKey must be an RSA public key in a Protobase app");
            return key;
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            refuseToLoad("plugins.LiveUpdate.publicKey must be an RSA public key in a Protobase app");
            return null;
        }
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
        String bundleId = call.getString("bundleId");
        boolean allowed =
            "manifest".equals(call.getString("artifactType")) &&
            BundlesFolder.isBundleId(BundlesFolder.of(getContext()), bundleId) &&
            (releasesUrl + "/" + bundleId).equals(call.getString("url"));
        if (!allowed) {
            Refusal.rejectMethod(call, "LiveUpdate", "downloadBundle");
            return;
        }
        if (blocked(bundleId)) {
            call.reject("LiveUpdate.downloadBundle refused release " + bundleId + ": it was rolled back");
            return;
        }
        if (downloads.incrementAndGet() > MAX_DOWNLOADS) {
            call.reject("LiveUpdate.downloadBundle was called too often in this run of the app");
            return;
        }
        clear(call);
        downloader.execute(() -> download(call, bundleId));
    }

    // Answers the call once what the download left is deleted, so its caller never sees it.
    private void download(PluginCall call, String bundleId) {
        File downloads = new File(getContext().getFilesDir(), DOWNLOADS);
        File dir = new File(downloads, UUID.randomUUID().toString());
        String refusal = null;
        try {
            downloadInto(dir, bundleId);
        } catch (BundleRefused e) {
            refusal = "LiveUpdate.downloadBundle refused release " + bundleId + ": " + e.getMessage();
        } catch (IOException e) {
            refusal = "LiveUpdate.downloadBundle could not download release " + bundleId;
        } finally {
            BundleRemoval.delete(downloads, dir);
        }
        if (refusal == null) call.resolve();
        else call.reject(refusal);
    }

    // Downloads release `bundleId` into `dir`, then moves it into the bundles folder and raises the highest order.
    private void downloadInto(File dir, String bundleId) throws BundleRefused, IOException {
        File bundles = BundlesFolder.of(getContext());
        if (!dir.mkdirs() || !(bundles.isDirectory() || bundles.mkdirs())) throw new IOException("Cannot create " + dir);
        String current = bundleIdOf(getBridge().getServerBasePath());
        OwnFiles own = current == null ? builtInFiles() : OwnFiles.inFolder(new File(bundles, current));
        long[] highest;
        synchronized (order) {
            highest = highestOrder();
        }
        ReleaseStatement statement = new ReleaseDownload(releasesUrl, publicKey, binary).download(bundleId, dir, own, builtInOrder, highest);
        File target = new File(bundles, bundleId);
        // The same release downloaded before stays; setNextBundle checks it anyway.
        if (!target.exists() && !dir.renameTo(target)) throw new IOException("Cannot move " + dir);
        synchronized (order) {
            if (ReleaseOrder.compare(statement.order, highestOrder()) > 0) {
                prefs().edit().putString(HIGHEST_ORDER, ReleaseOrder.format(statement.order)).commit();
            }
        }
    }

    @Override
    @PluginMethod
    public void setNextBundle(PluginCall call) {
        // A null id, which the stock code takes for the built-in bundle, is refused too: it would take the app below
        // what it downloaded, and only the stock rollback goes there.
        Object bundleId = call.getData().opt("bundleId");
        if (!(bundleId instanceof String) || !BundlesFolder.isBundleId(BundlesFolder.of(getContext()), (String) bundleId)) {
            Refusal.rejectMethod(call, "LiveUpdate", "setNextBundle");
            return;
        }
        String id = (String) bundleId;
        File bundles = BundlesFolder.of(getContext());
        synchronized (order) {
            try {
                if (blocked(id)) throw new BundleRefused("it was rolled back");
                ReleaseStatement next = BundleCheck.check(new File(bundles, id), id, publicKey, binary);
                ReleaseOrder.acceptNext(next.order, currentOrder(bundles), highestOrder());
            } catch (BundleRefused e) {
                if (!id.equals(bundleIdOf(getBridge().getServerBasePath())) && !id.equals(bundleIdOf(nextPath()))) {
                    BundleRemoval.delete(bundles, new File(bundles, id));
                }
                call.reject("LiveUpdate.setNextBundle refused bundle " + id + ": " + e.getMessage());
                return;
            }
            clear(call).put("bundleId", id);
            super.setNextBundle(call);
        }
    }

    // The binary's own files, in the assets folder Capacitor serves them from, as the manifest the CLI writes beside them lists them; none without one, as in a binary built before it.
    private OwnFiles builtInFiles() throws IOException {
        AssetManager assets = getContext().getAssets();
        ReleaseManifest manifest;
        try (InputStream in = assets.open(Bridge.DEFAULT_WEB_ASSET_DIR + "/" + ReleaseManifest.FILE)) {
            manifest = ReleaseManifest.parse(Bounded.read(in, ReleaseManifest.MAX_BYTES, "the built-in manifest"), new File(Bridge.DEFAULT_WEB_ASSET_DIR));
        } catch (FileNotFoundException | BundleRefused e) {
            return OwnFiles.NONE;
        }
        Map<String, String> hrefs = new HashMap<>();
        for (ReleaseManifest.Item item : manifest.items) hrefs.put(item.checksum, item.href);
        return checksum -> hrefs.containsKey(checksum) ? assets.open(Bridge.DEFAULT_WEB_ASSET_DIR + "/" + hrefs.get(checksum)) : null;
    }

    // The running bundle's order: the built-in one's, or what its statement says, checked against the key.
    private long[] currentOrder(File bundles) throws BundleRefused {
        String current = bundleIdOf(getBridge().getServerBasePath());
        if (current == null) return builtInOrder;
        try {
            byte[] statement = Bounded.read(new File(new File(bundles, current), ReleaseStatement.FILE), ReleaseStatement.MAX_BYTES, "the running bundle's statement");
            return ReleaseStatement.verify(statement, current, publicKey).order;
        } catch (IOException e) {
            throw new BundleRefused("the running bundle's statement could not be read");
        }
    }

    private long[] highestOrder() {
        return ReleaseOrder.parse(prefs().getString(HIGHEST_ORDER, null));
    }

    private boolean blocked(String bundleId) {
        String list = getContext().getSharedPreferences(LiveUpdatePlugin.SHARED_PREFERENCES_NAME, Activity.MODE_PRIVATE).getString(BlockedBundles.KEY, null);
        return BlockedBundles.blocks(list, bundleId);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(ORDER_PREFS, Activity.MODE_PRIVATE);
    }

    // Where the stock code keeps the next bundle, Capacitor's server path (LiveUpdate.java:1550, Bridge.java:295-302).
    private String nextPath() {
        return getContext().getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE).getString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, null);
    }

    // The id of the downloaded bundle at `path`, as the stock code names it (LiveUpdate.java:1214-1262), or null for the
    // built-in one and any path outside the bundles folder.
    private String bundleIdOf(String path) {
        if (path == null || path.isEmpty()) return null;
        File bundles = BundlesFolder.of(getContext());
        String name = new File(path).getName();
        return BundlesFolder.isBundleId(bundles, name) && new File(bundles, name).getAbsolutePath().equals(new File(path).getAbsolutePath()) ? name : null;
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
