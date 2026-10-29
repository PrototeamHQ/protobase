package net.protobase.mobile;

import static net.protobase.mobile.Refusals.refused;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.util.HashMap;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ReleaseDownloadTest {

    private static final KeyPair KEY = TestRelease.newKey();
    private static final Map<String, byte[]> OLD = TestRelease.files("index.html", "<!doctype html>old", "assets/a.js", "a(1)", "assets/b.js", "b(1)");
    private static final Map<String, byte[]> NEW = TestRelease.files("index.html", "<!doctype html>new", "assets/a.js", "a(2)", "assets/b.js", "b(1)");

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private ReleaseServer server;
    private File dir;

    @Before
    public void start() throws Exception {
        server = new ReleaseServer();
        dir = temp.newFolder("downloads", "one");
    }

    @After
    public void stop() throws Exception {
        server.close();
    }

    // The binary's own files, older than every release below.
    private static final long[] BUILT_IN = { 4, 0 };

    private ReleaseStatement download(String id, OwnFiles own, long[] builtIn, long[] highest) throws Exception {
        return new ReleaseDownload(server.url(), KEY.getPublic(), TestRelease.BINARY).download(id, dir, own, builtIn, highest);
    }

    private ReleaseStatement download(String id, File current, long[] builtIn, long[] highest) throws Exception {
        return download(id, current == null ? OwnFiles.NONE : OwnFiles.inFolder(current), builtIn, highest);
    }

    private ReleaseStatement download(String id, File current, long[] highest) throws Exception {
        return download(id, current, BUILT_IN, highest);
    }

    private ReleaseStatement download(String id) throws Exception {
        return download(id, (File) null, ReleaseOrder.NONE);
    }

    @Test
    public void downloadsAReleaseBoundToItsStatementIntoTheFolder() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(release);
        assertArrayEquals(new long[] { 6, 0 }, download(release.bundleId).order);
        assertEquals("a(2)", new String(Files.readAllBytes(new File(dir, "assets/a.js").toPath()), StandardCharsets.UTF_8));
        BundleCheck.check(dir, release.bundleId, KEY.getPublic(), TestRelease.BINARY);
    }

    @Test
    public void refusesAnOlderReleaseServedUnderTheNewId() throws Exception {
        TestRelease older = TestRelease.of(KEY, new long[] { 5, 0 }, OLD);
        TestRelease newer = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(older, newer.bundleId);
        refused("its id does not name", () -> download(newer.bundleId));
    }

    @Test
    public void refusesAnOlderReleaseThanOneTheAppDownloaded() throws Exception {
        TestRelease older = TestRelease.of(KEY, new long[] { 5, 0 }, OLD);
        server.serve(older);
        refused("older than a release the app downloaded", () -> download(older.bundleId, (File) null, new long[] { 6, 0 }));
        assertFalse(new File(dir, "index.html").exists());
    }

    @Test
    public void refusesAReleaseNotNewerThanTheBuiltInFilesBeforeWritingAnyFile() throws Exception {
        TestRelease older = TestRelease.of(KEY, new long[] { 5, 0 }, OLD);
        server.serve(older);
        refused("not newer than the app's built-in files", () -> download(older.bundleId, (File) null, new long[] { 6, 0 }, ReleaseOrder.NONE));
        refused("not newer than the app's built-in files", () -> download(older.bundleId, (File) null, new long[] { 5, 0 }, ReleaseOrder.NONE));
        assertFalse(new File(dir, "index.html").exists());
    }

    @Test
    public void refusesAFileOfTheSignedReleaseAlteredOnTheWay() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(release);
        // The same size as the file the manifest names, so only its checksum tells them apart.
        server.answers.put(release.bundleId + "?assets/a.js", "a(3)".getBytes(StandardCharsets.UTF_8));
        refused("its assets/a.js is not the file its manifest names", () -> download(release.bundleId));
    }

    @Test
    public void copiesTheFilesTheBinaryHasAndFetchesOnlyTheOthers() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(release);
        // The binary's own files, by checksum, as GuardedLiveUpdate opens them from its assets.
        Map<String, byte[]> own = new HashMap<>();
        for (byte[] content : OLD.values()) own.put(Sha256.of(content), content);
        // A copy that does not hash to what it is listed under is fetched instead.
        own.put(Sha256.of(NEW.get("index.html")), "<!doctype html>evil".getBytes(StandardCharsets.UTF_8));
        download(release.bundleId, checksum -> own.containsKey(checksum) ? new ByteArrayInputStream(own.get(checksum)) : null, BUILT_IN, ReleaseOrder.NONE);
        assertTrue(server.asked.contains(release.bundleId + "?assets/a.js"));
        assertTrue(server.asked.contains(release.bundleId + "?index.html"));
        assertFalse(server.asked.contains(release.bundleId + "?assets/b.js"));
        assertEquals("<!doctype html>new", new String(Files.readAllBytes(new File(dir, "index.html").toPath()), StandardCharsets.UTF_8));
        BundleCheck.check(dir, release.bundleId, KEY.getPublic(), TestRelease.BINARY);
    }

    @Test
    public void refusesTwoSignedFilesSwappedBetweenHrefs() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(release);
        server.answers.put(release.bundleId + "?assets/a.js", NEW.get("assets/b.js"));
        server.answers.put(release.bundleId + "?assets/b.js", NEW.get("assets/a.js"));
        refused("is not the file its manifest names", () -> download(release.bundleId));
    }

    @Test
    public void refusesTheSameHrefsAnswerFromAnEarlierReleaseWithTheSameKey() throws Exception {
        TestRelease older = TestRelease.of(KEY, new long[] { 5, 0 }, OLD);
        TestRelease newer = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(newer);
        server.answers.put(newer.bundleId + "?assets/a.js", older.files.get("assets/a.js"));
        refused("its assets/a.js is not the file its manifest names", () -> download(newer.bundleId));
        server.serve(newer);
        server.answers.put(newer.bundleId + "?" + ReleaseManifest.FILE, older.manifest);
        refused("its manifest is not the one its statement names", () -> download(newer.bundleId));
    }

    @Test
    public void refusesAClimbingHrefBeforeWritingOrAskingForAnyFile() throws Exception {
        String sum = Sha256.of("evil".getBytes(StandardCharsets.UTF_8));
        byte[] manifest = ("[{\"href\":\"index.html\",\"checksum\":\"" + sum + "\",\"sizeInBytes\":4},{\"href\":\"../../escaped.js\",\"checksum\":\"" + sum + "\",\"sizeInBytes\":4}]").getBytes(StandardCharsets.UTF_8);
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, TestRelease.files("index.html", "evil", "../../escaped.js", "evil"), manifest, TestRelease.APP_ID, TestRelease.FINGERPRINT, TestRelease.SHELL);
        server.serve(release);
        refused("outside its folder", () -> download(release.bundleId));
        assertFalse(new File(temp.getRoot(), "escaped.js").exists());
        assertEquals(0, dir.list().length);
        assertEquals(2, server.asked.size());
    }

    @Test
    public void refusesAReleaseForAnotherBinary() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, NEW, "[]".getBytes(), TestRelease.APP_ID, TestRelease.FINGERPRINT, "0.15.0");
        server.serve(release);
        refused("another shell version", () -> download(release.bundleId));
    }

    @Test
    public void refusesAFileLargerThanItsManifestSays() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(release);
        server.answers.put(release.bundleId + "?assets/a.js", "a(2)a(2)".getBytes(StandardCharsets.UTF_8));
        refused("its assets/a.js is not the file its manifest names", () -> download(release.bundleId));
    }

    @Test
    public void followsNoRedirect() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(release);
        server.redirect = server.url() + "/" + release.bundleId + "?href=" + ReleaseStatement.FILE;
        refused("the server answered 302", () -> download(release.bundleId));
    }

    @Test
    public void copiesAFileTheRunningBundleHasByItsContentAndFetchesOneItAltered() throws Exception {
        TestRelease older = TestRelease.of(KEY, new long[] { 5, 0 }, OLD);
        File current = older.layOut(temp.newFolder("bundles"));
        TestRelease newer = TestRelease.of(KEY, new long[] { 6, 0 }, NEW);
        server.serve(newer);
        server.answers.remove(newer.bundleId + "?assets/b.js");
        download(newer.bundleId, current, ReleaseOrder.NONE);
        assertFalse(server.asked.contains(newer.bundleId + "?assets/b.js"));

        // The running bundle's copy altered on disk: fetched instead, and refused when the server has none.
        dir = temp.newFolder("downloads", "two");
        server.asked.clear();
        TestRelease.write(new File(current, "assets/b.js"), "b(9)");
        refused("the server answered 404 for assets/b.js", () -> download(newer.bundleId, current, ReleaseOrder.NONE));
        assertTrue(server.asked.contains(newer.bundleId + "?assets/b.js"));
    }
}
