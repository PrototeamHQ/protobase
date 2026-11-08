package net.protobase.mobile;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Map;
import org.junit.Test;

public class WorkspaceOriginTest {

    @Test
    public void keepsAnHttpsOrLoopbackOriginInOneForm() {
        Map<String, String> cases = Map.of(
            "https://acme.example.com", "https://acme.example.com",
            "HTTPS://Acme.Example.com/", "https://acme.example.com",
            "https://acme.example.com:443", "https://acme.example.com",
            "https://acme.example.com:8443", "https://acme.example.com:8443",
            "http://localhost:3000", "http://localhost:3000",
            "http://127.0.0.1", "http://127.0.0.1");
        cases.forEach((text, origin) -> assertEquals(text, origin, WorkspaceOrigin.parse(text)));
    }

    @Test
    public void refusesAnythingButAnOrigin() {
        String[] texts = {null, "", "acme.example.com", "http://acme.example.com", "http://localhost.example.com", "ftp://acme.example.com",
            "file:///tmp", "https://user@acme.example.com", "https://u:p@acme.example.com", "https://acme.example.com/app",
            "https://acme.example.com/?a=1", "https://acme.example.com/#x", "https:///", "javascript:alert(1)", "https://acme example.com"};
        for (String text : texts) assertNull(text, WorkspaceOrigin.parse(text));
    }
}
