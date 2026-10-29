package net.protobase.mobile;

import static net.protobase.mobile.Refusals.refused;
import static org.junit.Assert.assertArrayEquals;

import java.io.File;
import java.nio.file.Files;
import java.security.KeyPair;
import java.util.Map;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class BundleCheckTest {

    private static final KeyPair KEY = TestRelease.newKey();
    private static final Map<String, byte[]> FILES = TestRelease.files("index.html", "<!doctype html>new", "assets/a.js", "a()", "assets/b.js", "b()");

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private File root;

    @Before
    public void folder() throws Exception {
        root = temp.newFolder("bundles");
    }

    private ReleaseStatement check(TestRelease release) throws Exception {
        return BundleCheck.check(new File(root, release.bundleId), release.bundleId, KEY.getPublic(), TestRelease.BINARY);
    }

    @Test
    public void takesABundleBoundToItsIdTheKeyAndThisBinary() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 6, 0 }, FILES);
        release.layOut(root);
        assertArrayEquals(new long[] { 6, 0 }, check(release).order);
    }

    @Test
    public void refusesAFileWhoseBytesAreNotTheManifests() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, FILES);
        File dir = release.layOut(root);
        TestRelease.write(new File(dir, "assets/a.js"), "evil");
        refused("its assets/a.js is not the file its manifest names", () -> check(release));
        TestRelease.write(new File(dir, "assets/a.js"), "a(;");
        refused("its assets/a.js is not the file its manifest names", () -> check(release));
    }

    @Test
    public void refusesTwoFilesSwappedBetweenHrefs() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, TestRelease.files("assets/a.js", "aaa", "assets/b.js", "bbb"));
        File dir = release.layOut(root);
        TestRelease.write(new File(dir, "assets/a.js"), "bbb");
        TestRelease.write(new File(dir, "assets/b.js"), "aaa");
        refused("is not the file its manifest names", () -> check(release));
    }

    @Test
    public void refusesAFileItsManifestDoesNotList() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, FILES);
        File dir = release.layOut(root);
        TestRelease.write(new File(dir, "assets/planted.js"), "evil()");
        refused("holds assets/planted.js, which its manifest does not list", () -> check(release));
    }

    @Test
    public void refusesAListedFileThatIsMissing() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, FILES);
        new File(release.layOut(root), "assets/b.js").delete();
        refused("it lacks assets/b.js", () -> check(release));
    }

    @Test
    public void refusesALinkInTheFolder() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, FILES);
        File dir = release.layOut(root);
        File outside = temp.newFile("outside.js");
        Files.write(outside.toPath(), "a()".getBytes());
        File link = new File(dir, "assets/a.js");
        link.delete();
        Files.createSymbolicLink(link.toPath(), outside.toPath());
        refused("outside its folder", () -> check(release));
        // A link inside the folder, beside the files it lists.
        Files.delete(link.toPath());
        TestRelease.write(link, "a()");
        Files.createSymbolicLink(new File(dir, "assets/c.js").toPath(), link.toPath());
        refused("holds a link", () -> check(release));
    }

    @Test
    public void refusesAManifestWithAnAbsoluteOrClimbingHref() throws Exception {
        for (String href : new String[] { "/data/local/tmp/x.js", "../x.js" }) {
            byte[] manifest = ("[{\"href\":\"" + href + "\",\"checksum\":\"" + Sha256.of(new byte[0]) + "\",\"sizeInBytes\":0}]").getBytes();
            TestRelease release = TestRelease.of(KEY, new long[] { 1 }, TestRelease.files(), manifest, TestRelease.APP_ID, TestRelease.FINGERPRINT, TestRelease.SHELL);
            release.layOut(root);
            refused("outside its folder", () -> check(release));
        }
    }

    @Test
    public void refusesAnOlderReleaseLaidOutUnderAnotherId() throws Exception {
        TestRelease older = TestRelease.of(KEY, new long[] { 1 }, FILES);
        TestRelease newer = TestRelease.of(KEY, new long[] { 2 }, FILES);
        older.layOut(root, newer.bundleId);
        refused("its id does not name", () -> check(newer));
    }

    @Test
    public void refusesABundleForAnotherBinary() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, FILES, "[]".getBytes(), TestRelease.APP_ID, "fedcba9876543210", TestRelease.SHELL);
        release.layOut(root);
        refused("another binary", () -> check(release));
    }

    @Test
    public void refusesABundleWithoutItsStatementOrManifestOrWithAMalformedOne() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, FILES);
        File dir = release.layOut(root);
        new File(dir, ReleaseManifest.FILE).delete();
        refused("its manifest is missing", () -> check(release));
        TestRelease.write(new File(dir, ReleaseManifest.FILE), "not json");
        refused("its manifest is not the one its statement names", () -> check(release));
        new File(dir, ReleaseStatement.FILE).delete();
        refused("its statement is missing", () -> check(release));
        refused("it is no bundle folder", () -> BundleCheck.check(new File(root, "0000000000000000"), "0000000000000000", KEY.getPublic(), TestRelease.BINARY));
    }
}
