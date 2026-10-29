package net.protobase.mobile;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/** SHA-256 in lowercase hex, of bytes, of a file, and of a bounded copy from a stream into a file. */
final class Sha256 {

    private Sha256() {}

    static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            // Every Java and Android runtime has SHA-256.
            throw new IllegalStateException(e);
        }
    }

    static String of(byte[]... parts) {
        MessageDigest digest = digest();
        for (byte[] part : parts) digest.update(part);
        return Hex.encode(digest.digest());
    }

    static String of(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            return copy(in, null, Long.MAX_VALUE);
        }
    }

    /**
     * Hashes what `in` holds while writing it to `out` (none: only hashes), refusing more than `limit` bytes. Returns
     * the hash, or null when `in` held more.
     */
    static String copy(InputStream in, OutputStream out, long limit) throws IOException {
        MessageDigest digest = digest();
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        for (int read; (read = in.read(buffer)) != -1; ) {
            total += read;
            if (total > limit) return null;
            digest.update(buffer, 0, read);
            if (out != null) out.write(buffer, 0, read);
        }
        return Hex.encode(digest.digest());
    }
}
