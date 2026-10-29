package net.protobase.mobile;

import java.io.File;
import java.io.IOException;
import java.security.PublicKey;
import java.util.HashSet;
import java.util.Set;

/**
 * Checks a bundle folder on disk before the app runs it: its statement names its id and is signed with the app's key
 * for this binary, its manifest is the one the statement names, every file it lists is there with its checksum and
 * size, and the folder holds nothing else, no link either.
 */
final class BundleCheck {

    private BundleCheck() {}

    static ReleaseStatement check(File dir, String bundleId, PublicKey key, ReleaseBinary binary) throws BundleRefused {
        try {
            if (!dir.isDirectory() || BundleRemoval.isLink(dir)) throw new BundleRefused("it is no bundle folder");
            ReleaseStatement statement = ReleaseStatement.verify(Bounded.read(new File(dir, ReleaseStatement.FILE), ReleaseStatement.MAX_BYTES, "its statement"), bundleId, key);
            binary.accept(statement);
            ReleaseManifest manifest = ReleaseManifest.verify(Bounded.read(new File(dir, ReleaseManifest.FILE), ReleaseManifest.MAX_BYTES, "its manifest"), statement, dir);
            Set<String> expected = new HashSet<>();
            expected.add(ReleaseStatement.FILE);
            expected.add(ReleaseManifest.FILE);
            for (ReleaseManifest.Item item : manifest.items) expected.add(item.href);
            walk(dir, "", expected, new int[] { expected.size() * 2 });
            for (ReleaseManifest.Item item : manifest.items) {
                File file = new File(dir, item.href);
                if (!file.isFile()) throw new BundleRefused("it lacks " + item.href);
                if (file.length() != item.size || !Sha256.of(file).equals(item.checksum)) throw new BundleRefused("its " + item.href + " is not the file its manifest names");
            }
            return statement;
        } catch (IOException e) {
            throw new BundleRefused("it could not be read");
        }
    }

    // Every entry below `dir`, as `prefix` + its name: a file must be expected, a folder is walked, a link refuses the
    // bundle. `budget` bounds the entries, so a planted tree cannot keep the check busy.
    private static void walk(File dir, String prefix, Set<String> expected, int[] budget) throws BundleRefused {
        File[] children = dir.listFiles();
        if (children == null) throw new BundleRefused("it could not be read");
        for (File child : children) {
            if (--budget[0] < 0) throw new BundleRefused("its folder holds files its manifest does not list");
            String path = prefix + child.getName();
            if (BundleRemoval.isLink(child)) throw new BundleRefused("its folder holds a link");
            if (child.isDirectory()) walk(child, path + "/", expected, budget);
            else if (!expected.contains(path)) throw new BundleRefused("its folder holds " + path + ", which its manifest does not list");
        }
    }
}
