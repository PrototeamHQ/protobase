package net.protobase.mobile;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.security.PublicKey;
import java.security.Signature;
import java.security.SignatureException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A release's statement (`releaseStatementFile` in @protobase/schema): what binds its manifest to its order, the app,
 * the binary and the shell, signed with the app's key. Only bytes the signature covers are parsed for what they say.
 */
final class ReleaseStatement {

    static final String FILE = "protobase-release.json";
    static final int MAX_BYTES = 64 * 1024;
    private static final byte[] CONTEXT = "protobase-mobile-release\n".getBytes(StandardCharsets.UTF_8);
    private static final Set<String> KEYS = new HashSet<>(Arrays.asList("manifest", "order", "appId", "fingerprint", "shellVersion"));
    private static final Pattern VERSION = Pattern.compile("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)");
    private static final int MAX_ORDER = 8;

    final String manifest;
    final long[] order;
    final String appId;
    final String fingerprint;
    final String shellVersion;

    private ReleaseStatement(String manifest, long[] order, String appId, String fingerprint, String shellVersion) {
        this.manifest = manifest;
        this.order = order;
        this.appId = appId;
        this.fingerprint = fingerprint;
        this.shellVersion = shellVersion;
    }

    /**
     * The statement `file` holds, when it is the one bundle `bundleId` names, the first 16 hex of the sha256 of its bytes
     * and of `key`'s SPKI DER, as `composeRelease` derives it, and `key` signed what it says.
     */
    static ReleaseStatement verify(byte[] file, String bundleId, PublicKey key) throws BundleRefused {
        if (file.length > MAX_BYTES) throw new BundleRefused("its statement is too large");
        if (!Sha256.of(file, key.getEncoded()).substring(0, 16).equals(bundleId)) {
            throw new BundleRefused("its id does not name its statement and the app's key");
        }
        byte[] payload;
        byte[] signature;
        try {
            JSONObject outer = new JSONObject(new String(file, StandardCharsets.UTF_8));
            payload = Hex.decode(outer.getString("payload"), "its statement's payload");
            signature = Hex.decode(outer.getString("signature"), "its statement's signature");
        } catch (JSONException e) {
            throw new BundleRefused("its statement is malformed");
        }
        if (!signed(payload, signature, key)) throw new BundleRefused("its statement is not signed with the app's key");
        try {
            return parse(new JSONObject(new String(payload, StandardCharsets.UTF_8)));
        } catch (JSONException e) {
            throw new BundleRefused("its statement says nothing it can read");
        }
    }

    private static boolean signed(byte[] payload, byte[] signature, PublicKey key) {
        try {
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(key);
            verifier.update(CONTEXT);
            verifier.update(payload);
            return verifier.verify(signature);
        } catch (SignatureException e) {
            // A signature of the wrong length or shape.
            return false;
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            // Every runtime has SHA256withRSA, and load() takes only an RSA key.
            throw new IllegalStateException(e);
        }
    }

    private static ReleaseStatement parse(JSONObject payload) throws JSONException, BundleRefused {
        Set<String> keys = new HashSet<>();
        for (Iterator<String> it = payload.keys(); it.hasNext(); ) keys.add(it.next());
        if (!keys.equals(KEYS)) throw new BundleRefused("its statement does not say exactly what binds it");
        String manifest = payload.getString("manifest");
        String appId = payload.getString("appId");
        String fingerprint = payload.getString("fingerprint");
        String shellVersion = payload.getString("shellVersion");
        if (!Hex.isHex(manifest, 64)) throw new BundleRefused("its statement names no manifest hash");
        if (appId.isEmpty()) throw new BundleRefused("its statement names no app");
        if (!Hex.isHex(fingerprint, 16)) throw new BundleRefused("its statement names no fingerprint");
        if (!VERSION.matcher(shellVersion).matches()) throw new BundleRefused("its statement names no shell version");
        return new ReleaseStatement(manifest, order(payload.getJSONArray("order")), appId, fingerprint, shellVersion);
    }

    private static long[] order(JSONArray array) throws JSONException, BundleRefused {
        if (array.length() == 0 || array.length() > MAX_ORDER) throw new BundleRefused("its statement names no order");
        long[] order = new long[array.length()];
        for (int i = 0; i < order.length; i++) {
            Object part = array.get(i);
            if (!(part instanceof Integer || part instanceof Long) || ((Number) part).longValue() < 0) {
                throw new BundleRefused("its statement names no order");
            }
            order[i] = ((Number) part).longValue();
        }
        return order;
    }

    /** The major and minor of an x.y.z version this class accepted. */
    static long[] majorMinor(String version) {
        String[] parts = version.split("\\.");
        return new long[] { Long.parseLong(parts[0]), Long.parseLong(parts[1]) };
    }

    static boolean isVersion(String version) {
        return version != null && VERSION.matcher(version).matches();
    }
}
