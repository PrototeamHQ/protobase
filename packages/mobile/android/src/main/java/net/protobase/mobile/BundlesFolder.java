package net.protobase.mobile;

import android.content.Context;
import java.io.File;
import java.io.IOException;
import java.util.regex.Pattern;

/** The folder the live updater keeps its bundles in, a fixed name below the app's files (LiveUpdate.java:114). */
final class BundlesFolder {

    static final String NAME = "_capacitor_live_update_bundles";

    // One path component: no separator, no `.` or `..`, no NUL.
    private static final Pattern BUNDLE_ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

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

    // An id that names a direct child of the folder once symlinks are resolved, so an entry linked elsewhere is refused.
    static boolean isBundleId(File root, String id) {
        if (id == null || !BUNDLE_ID.matcher(id).matches()) return false;
        try {
            File parent = new File(root, id).getCanonicalFile().getParentFile();
            return parent != null && parent.getPath().equals(root.getCanonicalPath());
        } catch (IOException e) {
            return false;
        }
    }
}
