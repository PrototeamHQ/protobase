package net.protobase.mobile;

import android.content.Context;
import java.io.File;
import java.io.IOException;

/** The folder the live updater keeps its bundles in, a fixed name below the app's files (LiveUpdate.java:114). */
final class BundlesFolder {

    static final String NAME = "_capacitor_live_update_bundles";

    private BundlesFolder() {}

    static File of(Context context) {
        return new File(context.getFilesDir(), NAME);
    }

    // Compares whole path components of the canonical paths, so a sibling such as `<bundles>_x` is not inside. One
    // that cannot be made canonical is refused.
    static boolean contains(File root, File file) {
        String canonical;
        String rootPath;
        try {
            canonical = file.getCanonicalPath();
            rootPath = root.getCanonicalPath();
        } catch (IOException e) {
            return false;
        }
        return canonical.equals(rootPath) || canonical.startsWith(rootPath + File.separator);
    }
}
