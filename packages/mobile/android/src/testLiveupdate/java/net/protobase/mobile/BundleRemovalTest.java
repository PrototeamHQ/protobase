package net.protobase.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class BundleRemovalTest {

    @Rule
    public TemporaryFolder temp = new TemporaryFolder();

    @Test
    public void deletesTheBundleAloneAndNeverThroughALink() throws Exception {
        File root = temp.newFolder("bundles");
        File outside = temp.newFolder("outside");
        File kept = new File(outside, "kept.js");
        TestRelease.write(kept, "keep");
        TestRelease.write(new File(root, "current/index.html"), "current");
        File refused = new File(root, "refused");
        TestRelease.write(new File(refused, "assets/a.js"), "a");
        Files.createSymbolicLink(new File(refused, "linked").toPath(), outside.toPath());
        BundleRemoval.delete(root, refused);
        assertFalse(refused.exists());
        assertTrue(kept.exists());
        assertTrue(new File(root, "current/index.html").exists());
    }

    @Test
    public void deletesNothingOutsideTheFolder() throws Exception {
        File root = temp.newFolder("bundles");
        File outside = temp.newFolder("outside");
        BundleRemoval.delete(root, new File(root, "../outside"));
        assertTrue(outside.exists());
    }
}
