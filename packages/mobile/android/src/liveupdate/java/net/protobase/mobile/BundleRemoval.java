package net.protobase.mobile;

import java.io.File;
import java.io.IOException;

/** Deletes a folder the guard owns, never following a link out of it: a link is deleted itself. */
final class BundleRemoval {

    private BundleRemoval() {}

    static void delete(File root, File target) {
        if (!target.exists() || !BundlesFolder.contains(root, target)) return;
        deleteTree(target);
    }

    private static void deleteTree(File file) {
        if (file.isDirectory() && !isLink(file)) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteTree(child);
        }
        file.delete();
    }

    /** Whether `file` is a link: its canonical path is not its parent's followed by its name. One that cannot be resolved counts. */
    static boolean isLink(File file) {
        try {
            File parent = file.getAbsoluteFile().getParentFile();
            return parent == null || !file.getCanonicalPath().equals(new File(parent.getCanonicalFile(), file.getName()).getPath());
        } catch (IOException e) {
            return true;
        }
    }
}
