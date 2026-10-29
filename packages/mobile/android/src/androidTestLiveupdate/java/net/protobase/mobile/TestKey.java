package net.protobase.mobile;

import android.util.Base64;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;

/** The test's own signing key, whose public half the test's capacitor.config.json pins. It signs nothing else. */
final class TestKey {

    private static final String PUBLIC = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxZbkUT82x2WgEDMfccUyNsmZO8SKS999/ejloKkIAzktthpqRh44BHigtd/CWi6NBo3nW4F1i7VdDvDqEJ3g1zftH4TP/G2dy8Ls5uQ9xwDd1fVwXpPkywYYbYtorB7xHd66NNd+gQPCSNCKdUXs8kH2APBGbRkWM5CqwFOXu9G4oSOZVF9krp5Q0/t94s7MCeHkAZ/nDpRuHKpzrNOiuW8CKHZ9XNPpmp7dC2D4fvPd0XbrOjGKEqhIh8y3M+80A9MCcFuf5Y0/hPf1iCIS6SeM7e9mCVYHGfNf+iQuDR45ft6XX5w2D07dtkocibaAGy1tjvGt01cmS9kQubDbNQIDAQAB";
    private static final String PRIVATE = "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDFluRRPzbHZaAQMx9xxTI2yZk7xIpL33396OWgqQgDOS22GmpGHjgEeKC138JaLo0GjedbgXWLtV0O8OoQneDXN+0fhM/8bZ3Lwuzm5D3HAN3V9XBek+TLBhhti2isHvEd3ro0136BA8JI0Ip1RezyQfYA8EZtGRYzkKrAU5e70bihI5lUX2SunlDT+33izswJ4eQBn+cOlG4cqnOs06K5bwIodn1c0+mant0LYPh+893Rdus6MYoSqEiHzLcz7zQD0wJwW5/ljT+E9/WIIhLpJ4zt72YJVgcZ81/6JC4NHjl+3pdfnDYPTt22ShyJtoAbLW2O8a3TVyZL2RC5sNs1AgMBAAECggEACBR7kbb8DnthaEgu6QAfZY4o7gDDhwbEqDV17nP7F+amr+O0pNlngQdNyyIzWGy+55218FAC9oucGphPeg56u1JWKAvOVYxF/6cg+PAsdo7ag31d8wApQwQky5X/2coKIiaRhsepLK1yrHeaseECJ4X7AV7SAnQcLE+mK+c/NTbz6Mm6Pop4Z+WvS7y1UwdXa09b0Sit+A1lvq+Jmla09LzUjy5s/EgMJFuFji4XzXRXeyFQiilYYCLaHeCjCLzLPpO5TsTf9Vfi9mdetZva4IyBT9Gykt5mAaWu+1cLO59Xb3Ka4AlJ69dew98fHxrRNHrw2WMk+2ka0HoY0agxAQKBgQDihhMbxGafzlPTPWgL+rF69lR3CZ68Xpia6j0uUIyfP61Z+/9/fUXo7TFo0AEPJkmryfPy+ba7MRCF5DXjqNQMyINqGA1oKvhgkFYZUPviFT7JCUJ//T+VTwoy+QsEE0Kc315aL8FPNLRWuLGrx2M1Lu7zZITHlHPhzQOjqcsa7QKBgQDfTPY3/xdv03t5oaf59KjtetVXhbZcSga74a72eIW+XtbuGE+e20DHtRn5zPv/Ky6w7vtcBvx56nRkk0dDvxYwFG+zngT6YfOZlB92GqEtWbMYTdg6b1aNTHgEZ6/X9EM/gkRpQcwyBIKWuoyxHpsYjdqf9hRpDu1fFzNL2AQQaQKBgDMgn998jM00/KaJDZrmknh2cMoNWc6aa0dL51M0ywiGjtHoltpnpAfWwXguuo54zdgAVRdaVWwavuf5glBIItRfzYl8tEn2qOjiqww7wx5cPTeS53eL6XYByQOIQnxA/J/7qoggjzkZZDrOpQtojXPLjBNTdMS3NRCZ/WBLSpRhAoGARmhF2jIcea386MUH6dAy024/hnEqpr7QkL0AJcaqpPPSYRBZSoVnT5DSt+jiK/q5piA0MTgis24xdOTbO4ksvcwzzDau6yOnY21I3jxXRa1awvcIjqQ8biEGVp063KSv735rg6SzdbHmWxBG/DHiRUO1A2rb1KRYQ/tUuT1LSsECgYBDkqk7pjtrR4lbD8cYiySvroGNp3G+ghvIXXJnPTIMoDgc1m7AG/faDWkqeQ5xAwX6r/qIwZATE+OuSTu0R9+z0O+OmfOw5zOwhcMl2K8eoffhmqARKJc/Pn27fpanj+Io5w0qwzNOjC7CYlLWWJ/GK7cnRg/BfeEvrzmST/sSbA==";

    private TestKey() {}

    static KeyPair pair() throws Exception {
        KeyFactory rsa = KeyFactory.getInstance("RSA");
        return new KeyPair(
            rsa.generatePublic(new X509EncodedKeySpec(Base64.decode(PUBLIC, Base64.DEFAULT))),
            rsa.generatePrivate(new PKCS8EncodedKeySpec(Base64.decode(PRIVATE, Base64.DEFAULT)))
        );
    }
}
