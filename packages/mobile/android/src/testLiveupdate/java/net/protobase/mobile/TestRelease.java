package net.protobase.mobile;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.PrivateKey;
import java.security.Signature;
import java.util.Map;
import java.util.TreeMap;

/** A release as the server's composeRelease makes one, signed with a test key, to serve or to lay out as a bundle. */
final class TestRelease {

    static final String APP_ID = "com.example.shop";
    static final String FINGERPRINT = "0123456789abcdef";
    static final String SHELL = "0.14.2";
    static final ReleaseBinary BINARY = new ReleaseBinary(APP_ID, FINGERPRINT, SHELL);

    static KeyPair newKey() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            return generator.generateKeyPair();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    final String bundleId;
    final byte[] statement;
    final byte[] manifest;
    final Map<String, byte[]> files;

    private TestRelease(String bundleId, byte[] statement, byte[] manifest, Map<String, byte[]> files) {
        this.bundleId = bundleId;
        this.statement = statement;
        this.manifest = manifest;
        this.files = files;
    }

    static Map<String, byte[]> files(String... hrefsAndContents) {
        Map<String, byte[]> files = new TreeMap<>();
        for (int i = 0; i < hrefsAndContents.length; i += 2) files.put(hrefsAndContents[i], hrefsAndContents[i + 1].getBytes(StandardCharsets.UTF_8));
        return files;
    }

    static TestRelease of(KeyPair key, long[] order, Map<String, byte[]> files) {
        return of(key, order, files, APP_ID);
    }

    static TestRelease of(KeyPair key, long[] order, Map<String, byte[]> files, String appId) {
        return of(key, order, files, manifestOf(files), appId, FINGERPRINT, SHELL);
    }

    static byte[] manifestOf(Map<String, byte[]> files) {
        StringBuilder items = new StringBuilder("[");
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            if (items.length() > 1) items.append(',');
            items.append("{\"href\":").append(quote(file.getKey())).append(",\"checksum\":\"").append(Sha256.of(file.getValue())).append("\",\"sizeInBytes\":").append(file.getValue().length).append('}');
        }
        return items.append(']').toString().getBytes(StandardCharsets.UTF_8);
    }

    static TestRelease of(KeyPair key, long[] order, Map<String, byte[]> files, byte[] manifest, String appId, String fingerprint, String shell) {
        String payload = "{\"manifest\":\"" + Sha256.of(manifest) + "\",\"order\":[" + ReleaseOrder.format(order) + "],\"appId\":" + quote(appId) + ",\"fingerprint\":" + quote(fingerprint) + ",\"shellVersion\":" + quote(shell) + "}";
        return signed(key, payload.getBytes(StandardCharsets.UTF_8), manifest, files);
    }

    /** A statement whose payload is `payload` exactly, signed with the context line as the server signs it. */
    static TestRelease signed(KeyPair key, byte[] payload, byte[] manifest, Map<String, byte[]> files) {
        byte[] context = "protobase-mobile-release\n".getBytes(StandardCharsets.UTF_8);
        byte[] signed = new byte[context.length + payload.length];
        System.arraycopy(context, 0, signed, 0, context.length);
        System.arraycopy(payload, 0, signed, context.length, payload.length);
        return withStatement(key, statementOf(payload, sign(key.getPrivate(), signed)), manifest, files);
    }

    static byte[] statementOf(byte[] payload, byte[] signature) {
        return ("{\"payload\":\"" + Hex.encode(payload) + "\",\"signature\":\"" + Hex.encode(signature) + "\"}").getBytes(StandardCharsets.UTF_8);
    }

    static TestRelease withStatement(KeyPair key, byte[] statement, byte[] manifest, Map<String, byte[]> files) {
        return new TestRelease(Sha256.of(statement, key.getPublic().getEncoded()).substring(0, 16), statement, manifest, files);
    }

    // A JSON string of `text`, which in these tests holds no control character.
    static String quote(String text) {
        return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    static byte[] sign(PrivateKey key, byte[] bytes) {
        try {
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(key);
            signer.update(bytes);
            return signer.sign();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Lays the release out as a bundle folder `root/<id>`, as a finished download leaves it, and returns the folder. */
    File layOut(File root) throws IOException {
        return layOut(root, bundleId);
    }

    File layOut(File root, String id) throws IOException {
        File dir = new File(root, id);
        for (Map.Entry<String, byte[]> file : files.entrySet()) write(new File(dir, file.getKey()), file.getValue());
        write(new File(dir, ReleaseStatement.FILE), statement);
        write(new File(dir, ReleaseManifest.FILE), manifest);
        return dir;
    }

    static void write(File file, byte[] bytes) throws IOException {
        file.getParentFile().mkdirs();
        Files.write(file.toPath(), bytes);
    }

    static void write(File file, String text) throws IOException {
        write(file, text.getBytes(StandardCharsets.UTF_8));
    }
}
