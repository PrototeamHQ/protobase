package net.protobase.mobile;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * The files of the bundle the app runs, by checksum, which a download copies instead of fetching: a downloaded
 * bundle's folder, or the binary's own files. A copy is hashed again as it is written, so it is bound by its content
 * to the release's manifest, never by where it came from.
 */
interface OwnFiles {

    /** None: every file is fetched. */
    OwnFiles NONE = checksum -> null;

    /** The file of checksum `checksum`, opened, or null when the bundle has none. */
    InputStream open(String checksum) throws IOException;

    /** The files of the bundle folder `dir` as its own manifest lists them; none when it has none that parses. */
    static OwnFiles inFolder(File dir) throws IOException {
        ReleaseManifest manifest;
        try {
            manifest = ReleaseManifest.parse(Bounded.read(new File(dir, ReleaseManifest.FILE), ReleaseManifest.MAX_BYTES, "its manifest"), dir);
        } catch (BundleRefused e) {
            return NONE;
        }
        Map<String, File> files = new HashMap<>();
        for (ReleaseManifest.Item item : manifest.items) {
            File file = new File(dir, item.href);
            if (file.isFile() && !BundleRemoval.isLink(file)) files.put(item.checksum, file);
        }
        return checksum -> files.containsKey(checksum) ? new FileInputStream(files.get(checksum)) : null;
    }
}
