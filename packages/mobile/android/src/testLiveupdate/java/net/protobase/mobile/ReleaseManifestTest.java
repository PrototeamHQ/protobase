package net.protobase.mobile;

import static net.protobase.mobile.Refusals.refused;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class ReleaseManifestTest {

    private static final KeyPair KEY = TestRelease.newKey();
    private static final String SUM = Sha256.of(new byte[0]);

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    private static byte[] manifest(String href) {
        return ("[{\"href\":\"" + href + "\",\"checksum\":\"" + SUM + "\",\"sizeInBytes\":0}]").getBytes(StandardCharsets.UTF_8);
    }

    @Test
    public void readsTheManifestItsStatementNames() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, TestRelease.files("index.html", "<!doctype html>", "assets/app.js", "1"));
        ReleaseStatement statement = ReleaseStatement.verify(release.statement, release.bundleId, KEY.getPublic());
        ReleaseManifest manifest = ReleaseManifest.verify(release.manifest, statement, temp.getRoot());
        assertEquals(2, manifest.items.size());
    }

    @Test
    public void refusesAManifestItsStatementDoesNotName() throws Exception {
        TestRelease release = TestRelease.of(KEY, new long[] { 1 }, TestRelease.files("index.html", "a"));
        ReleaseStatement statement = ReleaseStatement.verify(release.statement, release.bundleId, KEY.getPublic());
        refused("not the one its statement names", () -> ReleaseManifest.verify(manifest("index.html"), statement, temp.getRoot()));
    }

    @Test
    public void refusesAnHrefThatClimbsOutIsAbsoluteOrIsNoPlainPath() throws Exception {
        String[] hrefs = { "../outside.txt", "assets/../../outside.txt", "/data/data/x", "a//b", "./a", "a/.", "a\\\\b", "a\\u0000b", "", ReleaseManifest.FILE, ReleaseStatement.FILE };
        for (String href : hrefs) {
            refused("outside its folder", () -> ReleaseManifest.parse(manifest(href), temp.getRoot()));
        }
        assertTrue(ReleaseManifest.isRelativePath("assets/index-abc 1.js"));
        assertFalse(ReleaseManifest.isRelativePath("/index.html"));
    }

    @Test
    public void refusesAnHrefLinkedOutOfTheFolder() throws Exception {
        File outside = temp.newFolder("outside");
        File dir = temp.newFolder("bundle");
        java.nio.file.Files.createSymbolicLink(new File(dir, "assets").toPath(), outside.toPath());
        refused("outside its folder", () -> ReleaseManifest.parse(manifest("assets/app.js"), dir));
    }

    @Test
    public void refusesAMalformedOrOversizedEntry() throws Exception {
        String[] manifests = {
            "{}",
            "[1]",
            "[{\"href\":\"a\",\"checksum\":\"" + SUM + "\"}]",
            "[{\"href\":\"a\",\"checksum\":\"" + SUM + "\",\"sizeInBytes\":0,\"x\":1}]",
            "[{\"href\":\"a\",\"checksum\":\"00\",\"sizeInBytes\":0}]",
            "[{\"href\":\"a\",\"checksum\":\"" + SUM + "\",\"sizeInBytes\":-1}]",
            "[{\"href\":\"a\",\"checksum\":\"" + SUM + "\",\"sizeInBytes\":1.5}]",
            "[{\"href\":\"a\",\"checksum\":\"" + SUM + "\",\"sizeInBytes\":" + (ReleaseManifest.MAX_FILE_BYTES + 1) + "}]",
            "[{\"href\":\"a\",\"checksum\":\"" + SUM + "\",\"sizeInBytes\":0},{\"href\":\"a\",\"checksum\":\"" + SUM + "\",\"sizeInBytes\":0}]",
        };
        for (String text : manifests) {
            refused("its ", () -> ReleaseManifest.parse(text.getBytes(StandardCharsets.UTF_8), temp.getRoot()));
        }
    }
}
