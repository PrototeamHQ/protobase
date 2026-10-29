package net.protobase.mobile;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Reads a whole stream or file of at most a fixed size, so a planted or served file cannot fill the memory. */
final class Bounded {

    private Bounded() {}

    static byte[] read(InputStream in, int limit, String what) throws IOException, BundleRefused {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        for (int read; (read = in.read(buffer)) != -1; ) {
            if (out.size() + read > limit) throw new BundleRefused(what + " is larger than " + limit + " bytes");
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    static byte[] read(File file, int limit, String what) throws IOException, BundleRefused {
        if (!file.isFile()) throw new BundleRefused(what + " is missing");
        try (InputStream in = new FileInputStream(file)) {
            return read(in, limit, what);
        }
    }
}
