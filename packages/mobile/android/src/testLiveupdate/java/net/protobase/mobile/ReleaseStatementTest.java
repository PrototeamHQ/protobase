package net.protobase.mobile;

import static net.protobase.mobile.Refusals.refused;
import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import org.json.JSONObject;
import org.junit.Test;

public class ReleaseStatementTest {

    private static final KeyPair KEY = TestRelease.newKey();
    private static final byte[] MANIFEST = "[]".getBytes(StandardCharsets.UTF_8);

    private static byte[] payload(String json) {
        return json.getBytes(StandardCharsets.UTF_8);
    }

    private static String valid() {
        return "{\"manifest\":\"" + Sha256.of(MANIFEST) + "\",\"order\":[5,7],\"appId\":\"com.example.shop\",\"fingerprint\":\"0123456789abcdef\",\"shellVersion\":\"0.14.2\"}";
    }

    @Test
    public void readsWhatTheKeySignedUnderTheIdItNames() throws Exception {
        TestRelease release = TestRelease.signed(KEY, payload(valid()), MANIFEST, TestRelease.files());
        ReleaseStatement statement = ReleaseStatement.verify(release.statement, release.bundleId, KEY.getPublic());
        assertEquals(Sha256.of(MANIFEST), statement.manifest);
        assertArrayEquals(new long[] { 5, 7 }, statement.order);
        assertEquals("com.example.shop", statement.appId);
        assertEquals("0123456789abcdef", statement.fingerprint);
        assertEquals("0.14.2", statement.shellVersion);
    }

    @Test
    public void refusesAnotherIdThanItsOwn() throws Exception {
        TestRelease release = TestRelease.signed(KEY, payload(valid()), MANIFEST, TestRelease.files());
        refused("its id does not name", () -> ReleaseStatement.verify(release.statement, "0000000000000000", KEY.getPublic()));
    }

    @Test
    public void refusesAReleaseSignedWithAnotherKeyAlthoughItIsConsistent() throws Exception {
        KeyPair other = TestRelease.newKey();
        TestRelease release = TestRelease.signed(other, payload(valid()), MANIFEST, TestRelease.files());
        // Under the id its own key gives it, and under the one the pinned key would give it.
        refused("its id does not name", () -> ReleaseStatement.verify(release.statement, release.bundleId, KEY.getPublic()));
        String pinnedId = Sha256.of(release.statement, KEY.getPublic().getEncoded()).substring(0, 16);
        refused("not signed with the app's key", () -> ReleaseStatement.verify(release.statement, pinnedId, KEY.getPublic()));
    }

    @Test
    public void refusesAPayloadChangedAfterSigningSuchAsARaisedOrder() throws Exception {
        TestRelease release = TestRelease.signed(KEY, payload(valid()), MANIFEST, TestRelease.files());
        JSONObject outer = new JSONObject(new String(release.statement, StandardCharsets.UTF_8));
        byte[] raised = payload(valid().replace("[5,7]", "[9,9]"));
        byte[] forged = TestRelease.statementOf(raised, Hex.decode(outer.getString("signature"), "signature"));
        TestRelease forgedRelease = TestRelease.withStatement(KEY, forged, MANIFEST, TestRelease.files());
        refused("not signed with the app's key", () -> ReleaseStatement.verify(forged, forgedRelease.bundleId, KEY.getPublic()));
    }

    @Test
    public void refusesASignatureOverThePayloadWithoutTheContextLine() throws Exception {
        byte[] bytes = payload(valid());
        byte[] statement = TestRelease.statementOf(bytes, TestRelease.sign(KEY.getPrivate(), bytes));
        TestRelease release = TestRelease.withStatement(KEY, statement, MANIFEST, TestRelease.files());
        refused("not signed with the app's key", () -> ReleaseStatement.verify(statement, release.bundleId, KEY.getPublic()));
    }

    @Test
    public void refusesAMalformedStatement() throws Exception {
        for (String text : new String[] { "not json", "{}", "{\"payload\":\"zz\",\"signature\":\"00\"}", "{\"payload\":\"0\",\"signature\":\"00\"}" }) {
            byte[] statement = text.getBytes(StandardCharsets.UTF_8);
            String id = Sha256.of(statement, KEY.getPublic().getEncoded()).substring(0, 16);
            refused("its statement", () -> ReleaseStatement.verify(statement, id, KEY.getPublic()));
        }
    }

    @Test
    public void refusesASignedPayloadThatLacksOrAddsABindingOrGetsOneWrong() throws Exception {
        String[] payloads = {
            "not json",
            valid().replace(",\"order\":[5,7]", ""),
            valid().replace(",\"fingerprint\":\"0123456789abcdef\"", ""),
            valid().replace(",\"shellVersion\":\"0.14.2\"", ""),
            valid().replace("}", ",\"extra\":1}"),
            valid().replace("[5,7]", "[]"),
            valid().replace("[5,7]", "[5,-1]"),
            valid().replace("[5,7]", "[5,1.5]"),
            valid().replace("[5,7]", "[\"5\"]"),
            valid().replace("[5,7]", "[1,2,3,4,5,6,7,8,9]"),
            valid().replace("0.14.2", "0.14"),
            valid().replace("0123456789abcdef", "0123456789ABCDEF"),
            valid().replace("\"com.example.shop\"", "\"\""),
            valid().replace(Sha256.of(MANIFEST), "00"),
        };
        for (String text : payloads) {
            TestRelease release = TestRelease.signed(KEY, payload(text), MANIFEST, TestRelease.files());
            refused("its statement", () -> ReleaseStatement.verify(release.statement, release.bundleId, KEY.getPublic()));
        }
    }
}
