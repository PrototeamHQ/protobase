package net.protobase.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.net.URI;
import org.junit.Test;

public class SameOriginTest {

    private static final URI APP = URI.create("https://acme.example.com");

    @Test
    public void matchesTheSameSchemeHostAndPort() {
        assertTrue(SameOrigin.matches(URI.create("https://acme.example.com/a?b#c"), APP));
        assertTrue(SameOrigin.matches(URI.create("HTTPS://ACME.example.com:443"), APP));
        assertTrue(SameOrigin.matches(URI.create("http://localhost:8080/x"), URI.create("http://localhost:8080")));
    }

    @Test
    public void refusesAnotherSchemeHostOrPort() {
        assertFalse(SameOrigin.matches(URI.create("http://acme.example.com"), APP));
        assertFalse(SameOrigin.matches(URI.create("https://evil.example.com"), APP));
        assertFalse(SameOrigin.matches(URI.create("https://acme.example.com.evil.com"), APP));
        assertFalse(SameOrigin.matches(URI.create("https://acme.example.com:8443"), APP));
        assertFalse(SameOrigin.matches(URI.create("http://127.0.0.1:8081"), URI.create("http://127.0.0.1:8080")));
        assertFalse(SameOrigin.matches(URI.create("null"), APP));
    }
}
