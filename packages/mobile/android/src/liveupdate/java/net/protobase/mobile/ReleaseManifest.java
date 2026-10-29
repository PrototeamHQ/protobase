package net.protobase.mobile;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A release's manifest (`releaseManifestFile` in @protobase/schema): every file by `href`, with its sha256 and size.
 * Each href is checked as the very string the guard joins to a folder, before any file of it is read or written.
 */
final class ReleaseManifest {

    static final String FILE = "capawesome-live-update-manifest.json";
    static final int MAX_BYTES = 4 * 1024 * 1024;
    static final int MAX_FILES = 10_000;
    static final long MAX_FILE_BYTES = 64L * 1024 * 1024;
    static final long MAX_TOTAL_BYTES = 256L * 1024 * 1024;
    private static final int MAX_HREF = 1024;

    static final class Item {

        final String href;
        final String checksum;
        final long size;

        Item(String href, String checksum, long size) {
            this.href = href;
            this.checksum = checksum;
            this.size = size;
        }
    }

    final List<Item> items;

    private ReleaseManifest(List<Item> items) {
        this.items = Collections.unmodifiableList(items);
    }

    /** The manifest `bytes` hold, when they are the ones `statement` names, its files to lie inside `dir`. */
    static ReleaseManifest verify(byte[] bytes, ReleaseStatement statement, File dir) throws BundleRefused {
        if (!Sha256.of(bytes).equals(statement.manifest)) throw new BundleRefused("its manifest is not the one its statement names");
        return parse(bytes, dir);
    }

    /** The manifest `bytes` hold, each href naming a file inside `dir`. */
    static ReleaseManifest parse(byte[] bytes, File dir) throws BundleRefused {
        if (bytes.length > MAX_BYTES) throw new BundleRefused("its manifest is too large");
        try {
            JSONArray array = new JSONArray(new String(bytes, StandardCharsets.UTF_8));
            if (array.length() > MAX_FILES) throw new BundleRefused("its manifest lists too many files");
            List<Item> items = new ArrayList<>();
            Set<String> hrefs = new HashSet<>();
            long total = 0;
            for (int i = 0; i < array.length(); i++) {
                Item item = item(array.getJSONObject(i), dir);
                if (!hrefs.add(item.href)) throw new BundleRefused("its manifest lists " + item.href + " twice");
                total += item.size;
                if (total > MAX_TOTAL_BYTES) throw new BundleRefused("its files are too large");
                items.add(item);
            }
            return new ReleaseManifest(items);
        } catch (JSONException e) {
            throw new BundleRefused("its manifest is malformed");
        }
    }

    private static Item item(JSONObject entry, File dir) throws JSONException, BundleRefused {
        if (entry.length() != 3) throw new BundleRefused("its manifest has an entry that is not an href, checksum and size");
        String href = entry.getString("href");
        String checksum = entry.getString("checksum");
        Object size = entry.get("sizeInBytes");
        if (!isRelativePath(href) || href.equals(FILE) || href.equals(ReleaseStatement.FILE) || !BundlesFolder.contains(dir, new File(dir, href))) {
            throw new BundleRefused("its manifest names a file outside its folder");
        }
        if (!Hex.isHex(checksum, 64)) throw new BundleRefused("its manifest names no checksum for " + href);
        if (!(size instanceof Integer || size instanceof Long) || ((Number) size).longValue() < 0 || ((Number) size).longValue() > MAX_FILE_BYTES) {
            throw new BundleRefused("its manifest names no size for " + href);
        }
        return new Item(href, checksum, ((Number) size).longValue());
    }

    // Path components joined by `/`: none empty, `.` or `..`, and no `\` or NUL, so neither an absolute path nor one
    // that climbs, nor one another platform reads otherwise.
    static boolean isRelativePath(String href) {
        if (href.isEmpty() || href.length() > MAX_HREF || href.indexOf('\\') >= 0 || href.indexOf('\0') >= 0) return false;
        for (String part : href.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) return false;
        }
        return true;
    }
}
