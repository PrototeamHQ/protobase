package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.lang.reflect.Field;
import java.security.KeyPair;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * The guarded live updater in a running Capacitor app: releases from a loopback server the test's capacitor.config.json
 * names, signed with the key it pins, downloaded and set as the next bundle through the plugin's own methods.
 */
@RunWith(AndroidJUnit4.class)
public class GuardedLiveUpdateTest {

    private static final int PORT = 18765;
    private static final Map<String, byte[]> OLD = TestRelease.files("index.html", "<!doctype html>old", "assets/a.js", "a(1)", "assets/b.js", "b(1)");
    private static final Map<String, byte[]> NEW = TestRelease.files("index.html", "<!doctype html>new", "assets/a.js", "a(2)", "assets/b.js", "b(1)");

    private static KeyPair key;
    private Context context;
    private File bundles;
    private String appId;
    private ReleaseServer server;
    private ActivityScenario<LiveUpdateTestActivity> scenario;
    private GuardedLiveUpdate plugin;

    @BeforeClass
    public static void loadKey() throws Exception {
        key = TestKey.pair();
    }

    @Before
    public void start() throws Exception {
        context = ApplicationProvider.getApplicationContext();
        appId = context.getPackageName();
        bundles = BundlesFolder.of(context);
        BundleRemoval.delete(bundles, bundles);
        context.getSharedPreferences("ProtobaseLiveUpdate", Activity.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin.SHARED_PREFERENCES_NAME, Activity.MODE_PRIVATE).edit().remove(BlockedBundles.KEY).commit();
        context.getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE).edit().remove(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH).commit();
        // Each test is a run of the app of its own, with its own few downloads.
        Field downloads = GuardedLiveUpdate.class.getDeclaredField("downloads");
        downloads.setAccessible(true);
        ((AtomicInteger) downloads.get(null)).set(0);
        server = new ReleaseServer(PORT);
        scenario = ActivityScenario.launch(LiveUpdateTestActivity.class);
        scenario.onActivity(activity -> plugin = (GuardedLiveUpdate) activity.getBridge().getPlugin("LiveUpdate").getInstance());
    }

    @After
    public void stop() throws Exception {
        scenario.close();
        server.close();
    }

    /** A call as page script makes it, answered to the test instead of the page. */
    private static final class Call extends PluginCall {

        final CountDownLatch answered = new CountDownLatch(1);
        volatile String error;

        Call(JSObject data) {
            super(null, "LiveUpdate", "test", "test", data);
        }

        @Override
        public void resolve() {
            answered.countDown();
        }

        @Override
        public void resolve(JSObject data) {
            answered.countDown();
        }

        @Override
        public void reject(String msg, String code, Exception ex, JSObject data) {
            error = msg;
            answered.countDown();
        }

        String await() throws InterruptedException {
            assertTrue("the call was answered", answered.await(60, TimeUnit.SECONDS));
            return error;
        }
    }

    private String download(String bundleId) throws Exception {
        JSObject data = new JSObject();
        data.put("artifactType", "manifest");
        data.put("bundleId", bundleId);
        data.put("url", server.url() + "/" + bundleId);
        Call call = new Call(data);
        plugin.downloadBundle(call);
        return call.await();
    }

    private String setNext(String bundleId) throws Exception {
        JSObject data = new JSObject();
        data.put("bundleId", bundleId);
        Call call = new Call(data);
        plugin.setNextBundle(call);
        return call.await();
    }

    private String nextId() {
        String path = context.getSharedPreferences(com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE).getString(com.getcapacitor.plugin.WebView.CAP_SERVER_PATH, "");
        return path.isEmpty() ? null : new File(path).getName();
    }

    // The order of the test app's own files, its capacitor.config.json's builtInOrder.
    private static final long BUILT_IN = 10;

    // A release `order` releases after the test app's own files.
    private TestRelease release(long order, Map<String, byte[]> files) {
        return TestRelease.of(key, new long[] { BUILT_IN + order, 0 }, files, appId);
    }

    private void block(String bundleId) {
        context.getSharedPreferences(io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin.SHARED_PREFERENCES_NAME, Activity.MODE_PRIVATE).edit().putString(BlockedBundles.KEY, "other1," + bundleId).commit();
    }

    private static void refused(String reason, String error) {
        assertTrue("refused for \"" + reason + "\", got " + error, error != null && error.contains(reason));
    }

    @Test
    public void downloadsAndSetsANewerReleaseBoundToItsStatement() throws Exception {
        TestRelease release = release(2, NEW);
        server.serve(release);
        assertNull(download(release.bundleId));
        assertNull(setNext(release.bundleId));
        assertEquals(release.bundleId, nextId());
    }

    @Test
    public void refusesAnOlderReleaseServedUnderANewIdAtDownloadAndAtSetNextBundle() throws Exception {
        TestRelease older = release(1, OLD);
        TestRelease newer = release(2, NEW);
        server.serve(older, newer.bundleId);
        refused("its id does not name", download(newer.bundleId));
        // The same release on disk under the new id, as the stock downloader would have left it.
        older.layOut(bundles, newer.bundleId);
        refused("its id does not name", setNext(newer.bundleId));
        assertFalse(new File(bundles, newer.bundleId).exists());
        assertNull(nextId());
    }

    @Test
    public void refusesTwoSignedFilesSwappedBetweenHrefs() throws Exception {
        TestRelease release = release(2, TestRelease.files("index.html", "<!doctype html>", "assets/a.js", "aaa", "assets/b.js", "bbb"));
        server.serve(release);
        server.answers.put(release.bundleId + "?assets/a.js", release.files.get("assets/b.js"));
        server.answers.put(release.bundleId + "?assets/b.js", release.files.get("assets/a.js"));
        refused("is not the file its manifest names", download(release.bundleId));
        File dir = release.layOut(bundles);
        TestRelease.write(new File(dir, "assets/a.js"), "bbb");
        TestRelease.write(new File(dir, "assets/b.js"), "aaa");
        refused("is not the file its manifest names", setNext(release.bundleId));
        assertFalse(dir.exists());
    }

    @Test
    public void refusesTheSameHrefsAnswerFromAnEarlierRelease() throws Exception {
        TestRelease older = release(1, OLD);
        TestRelease newer = release(2, NEW);
        server.serve(newer);
        server.answers.put(newer.bundleId + "?assets/a.js", older.files.get("assets/a.js"));
        refused("its assets/a.js is not the file its manifest names", download(newer.bundleId));
        assertFalse(new File(bundles, newer.bundleId).exists());
    }

    @Test
    public void refusesAClimbingHrefBeforeWritingAnyFile() throws Exception {
        String sum = Sha256.of("evil".getBytes());
        byte[] manifest = ("[{\"href\":\"index.html\",\"checksum\":\"" + sum + "\",\"sizeInBytes\":4},{\"href\":\"../../escaped.js\",\"checksum\":\"" + sum + "\",\"sizeInBytes\":4}]").getBytes();
        TestRelease release = TestRelease.of(key, new long[] { BUILT_IN + 2, 0 }, TestRelease.files("index.html", "evil", "../../escaped.js", "evil"), manifest, appId, TestRelease.FINGERPRINT, TestRelease.SHELL);
        server.serve(release);
        refused("outside its folder", download(release.bundleId));
        assertFalse(new File(context.getFilesDir(), "escaped.js").exists());
        assertEquals(2, server.asked.size());
        String[] left = new File(context.getFilesDir(), "_protobase_live_update_downloads").list();
        assertTrue(left == null || left.length == 0);
        assertFalse(new File(bundles, release.bundleId).exists());
    }

    @Test
    public void refusesAnOlderReleaseAfterANewerOneWasDownloaded() throws Exception {
        TestRelease a = release(1, OLD);
        TestRelease b = release(2, NEW);
        server.serve(a);
        server.serve(b);
        assertNull(download(a.bundleId));
        assertNull(download(b.bundleId));
        refused("older than a release the app downloaded", setNext(a.bundleId));
        assertFalse(new File(bundles, a.bundleId).exists());
        assertNull(setNext(b.bundleId));
        assertEquals(b.bundleId, nextId());
    }

    @Test
    public void refusesABundleWithAPlantedFileAndKeepsTheNextOne() throws Exception {
        TestRelease good = release(2, NEW);
        server.serve(good);
        assertNull(download(good.bundleId));
        assertNull(setNext(good.bundleId));
        File planted = release(3, NEW).layOut(bundles);
        TestRelease.write(new File(planted, "assets/planted.js"), "evil()");
        refused("which its manifest does not list", setNext(planted.getName()));
        assertFalse(planted.exists());
        assertEquals(good.bundleId, nextId());
        assertTrue(new File(bundles, good.bundleId).isDirectory());
    }

    @Test
    public void refusesADownloadedBundleAlteredOnDiskAndKeepsItWhileItIsNext() throws Exception {
        TestRelease release = release(2, NEW);
        server.serve(release);
        assertNull(download(release.bundleId));
        assertNull(setNext(release.bundleId));
        TestRelease.write(new File(bundles, release.bundleId + "/assets/a.js"), "evil()");
        refused("its assets/a.js is not the file its manifest names", setNext(release.bundleId));
        // The next bundle is in use, so it stays, as the stock code keeps a bundle in use.
        assertEquals(release.bundleId, nextId());
    }

    @Test
    public void aFreshInstallRefusesAReleaseNotNewerThanItsOwnFilesAtDownloadAndAtSetNextBundle() throws Exception {
        TestRelease below = TestRelease.of(key, new long[] { BUILT_IN - 1, 0 }, OLD, appId);
        TestRelease same = TestRelease.of(key, new long[] { BUILT_IN, 0 }, NEW, appId);
        for (TestRelease release : new TestRelease[] { below, same }) {
            server.serve(release);
            refused("not newer than the app's built-in files", download(release.bundleId));
            assertFalse(new File(bundles, release.bundleId).exists());
            // Laid out as a download the guard did not check would have left it.
            release.layOut(bundles);
            refused("not newer than the bundle the app runs", setNext(release.bundleId));
            assertFalse(new File(bundles, release.bundleId).exists());
        }
        assertNull(nextId());
    }

    @Test
    public void refusesARolledBackReleaseAtDownloadAndAtSetNextBundle() throws Exception {
        TestRelease release = release(2, NEW);
        server.serve(release);
        assertNull(download(release.bundleId));
        block(release.bundleId);
        refused("it was rolled back", setNext(release.bundleId));
        refused("it was rolled back", download(release.bundleId));
        assertNull(nextId());
    }

    @Test
    public void refusesEveryReleaseWhileTheBlockedListCannotBeRead() throws Exception {
        TestRelease release = release(2, NEW);
        server.serve(release);
        block("not;an;id");
        refused("it was rolled back", download(release.bundleId));
        assertTrue(server.asked.isEmpty());
    }

    @Test
    public void refusesTheBuiltInBundleAsTheNextOne() throws Exception {
        TestRelease release = release(2, NEW);
        server.serve(release);
        assertNull(download(release.bundleId));
        assertNull(setNext(release.bundleId));
        JSObject data = new JSObject();
        data.put("bundleId", org.json.JSONObject.NULL);
        Call call = new Call(data);
        plugin.setNextBundle(call);
        refused("setNextBundle", call.await());
        Call none = new Call(new JSObject());
        plugin.setNextBundle(none);
        refused("setNextBundle", none.await());
        assertEquals(release.bundleId, nextId());
    }

    @Test
    public void refusesAStatementSignedWithAnotherKey() throws Exception {
        TestRelease release = TestRelease.of(TestRelease.newKey(), new long[] { BUILT_IN + 2, 0 }, NEW, appId);
        server.serve(release);
        assertTrue(download(release.bundleId) != null);
        release.layOut(bundles);
        assertTrue(setNext(release.bundleId) != null);
        assertFalse(new File(bundles, release.bundleId).exists());
        assertNull(nextId());
    }

    @Test
    public void refusesAtSetNextBundleAReleaseForAnotherBinaryOnDisk() throws Exception {
        TestRelease fingerprint = TestRelease.of(key, new long[] { BUILT_IN + 2, 0 }, NEW, TestRelease.manifestOf(NEW), appId, "fedcba9876543210", TestRelease.SHELL);
        TestRelease shell = TestRelease.of(key, new long[] { BUILT_IN + 3, 0 }, NEW, TestRelease.manifestOf(NEW), appId, TestRelease.FINGERPRINT, "0.15.0");
        refused("another binary", setNextLaidOut(fingerprint));
        refused("another shell version", setNextLaidOut(shell));
        assertNull(nextId());
    }

    private String setNextLaidOut(TestRelease release) throws Exception {
        release.layOut(bundles);
        return setNext(release.bundleId);
    }

    @Test
    public void copiesTheFilesTheBinaryHasOnItsFirstDownload() throws Exception {
        // The test app's own index.html, which its assets' manifest lists.
        TestRelease release = release(2, TestRelease.files("index.html", "<!doctype html>\n<title>built-in</title>\n", "assets/a.js", "a(2)"));
        server.serve(release);
        server.answers.remove(release.bundleId + "?index.html");
        assertNull(download(release.bundleId));
        assertFalse(server.asked.contains(release.bundleId + "?index.html"));
        assertTrue(server.asked.contains(release.bundleId + "?assets/a.js"));
        assertNull(setNext(release.bundleId));
    }
}
