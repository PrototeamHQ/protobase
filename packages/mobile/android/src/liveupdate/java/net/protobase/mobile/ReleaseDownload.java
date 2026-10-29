package net.protobase.mobile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URLEncoder;
import java.security.PublicKey;

/**
 * Downloads release `bundleId` from `releasesUrl/<id>?href=<file>` into a folder, in place of the stock downloader,
 * which joins a manifest's hrefs to its path unchecked and checks each file only against its own signature
 * (LiveUpdate.java:817-872 of @capawesome/capacitor-live-update 8.7.1). First the statement, checked against the id,
 * the key, this binary and the highest order the app downloaded; then the manifest, checked against the statement and
 * every href against the folder before any file is fetched; then each file, hashed as it is written and refused unless
 * it is the one the manifest names. A file the running bundle has with the same checksum (OwnFiles) is copied from it
 * and hashed again, so it is bound by its content, never by its href.
 */
final class ReleaseDownload {

    private static final int TIMEOUT_MS = 30_000;

    private final String releasesUrl;
    private final PublicKey key;
    private final ReleaseBinary binary;

    ReleaseDownload(String releasesUrl, PublicKey key, ReleaseBinary binary) {
        this.releasesUrl = releasesUrl;
        this.key = key;
        this.binary = binary;
    }

    /**
     * Fills the empty folder `dir` with release `bundleId`, copying what `own`, the running bundle's files, has, and
     * checks it as a whole: its order above the built-in files' `builtIn` and not below `highest`, the highest
     * the app downloaded. Returns its statement.
     */
    ReleaseStatement download(String bundleId, File dir, OwnFiles own, long[] builtIn, long[] highest) throws BundleRefused, IOException {
        byte[] statementBytes = fetch(bundleId, ReleaseStatement.FILE, ReleaseStatement.MAX_BYTES);
        ReleaseStatement statement = ReleaseStatement.verify(statementBytes, bundleId, key);
        binary.accept(statement);
        ReleaseOrder.acceptDownload(statement.order, builtIn, highest);
        byte[] manifestBytes = fetch(bundleId, ReleaseManifest.FILE, ReleaseManifest.MAX_BYTES);
        ReleaseManifest manifest = ReleaseManifest.verify(manifestBytes, statement, dir);
        for (ReleaseManifest.Item item : manifest.items) {
            File target = new File(dir, item.href);
            File parent = target.getParentFile();
            if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create " + parent);
            InputStream copy = own.open(item.checksum);
            if (copy != null && item.checksum.equals(write(copy, target, item.size))) continue;
            if (!item.checksum.equals(write(open(bundleId, item.href), target, item.size))) {
                throw new BundleRefused("its " + item.href + " is not the file its manifest names");
            }
        }
        writeBytes(new File(dir, ReleaseStatement.FILE), statementBytes);
        writeBytes(new File(dir, ReleaseManifest.FILE), manifestBytes);
        return BundleCheck.check(dir, bundleId, key, binary);
    }

    // Writes at most `size` bytes of `in` to `target`; returns their sha256, or null when there were more or fewer.
    private static String write(InputStream in, File target, long size) throws IOException {
        try (InputStream source = in; OutputStream out = new FileOutputStream(target)) {
            String checksum = Sha256.copy(source, out, size);
            return target.length() == size ? checksum : null;
        }
    }

    private static void writeBytes(File target, byte[] bytes) throws IOException {
        try (OutputStream out = new FileOutputStream(target)) {
            out.write(bytes);
        }
    }

    private byte[] fetch(String bundleId, String href, int limit) throws BundleRefused, IOException {
        try (InputStream in = open(bundleId, href)) {
            return Bounded.read(in, limit, "its " + href);
        }
    }

    // The file `href` of the release, answered 200 by the releases URL itself: a redirect is no answer.
    private InputStream open(String bundleId, String href) throws BundleRefused, IOException {
        HttpURLConnection connection = (HttpURLConnection) URI.create(releasesUrl + "/" + bundleId + "?href=" + query(href)).toURL().openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        int status = connection.getResponseCode();
        if (status != HttpURLConnection.HTTP_OK) {
            connection.disconnect();
            throw new BundleRefused("the server answered " + status + " for " + href);
        }
        return connection.getInputStream();
    }

    // The href as a form value: a space as %20, which every server decodes alike, rather than `+`.
    private static String query(String href) {
        try {
            return URLEncoder.encode(href, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException e) {
            // Every runtime has UTF-8.
            throw new IllegalStateException(e);
        }
    }
}
