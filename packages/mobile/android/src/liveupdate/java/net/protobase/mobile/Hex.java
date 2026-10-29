package net.protobase.mobile;

/** Lowercase hex, as the server writes hashes and the statement; anything else is refused. */
final class Hex {

    private static final char[] DIGITS = "0123456789abcdef".toCharArray();

    private Hex() {}

    static String encode(byte[] bytes) {
        char[] text = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            text[i * 2] = DIGITS[(bytes[i] >> 4) & 0xf];
            text[i * 2 + 1] = DIGITS[bytes[i] & 0xf];
        }
        return new String(text);
    }

    static byte[] decode(String text, String what) throws BundleRefused {
        if (text.length() % 2 != 0) throw new BundleRefused(what + " is no hex");
        byte[] bytes = new byte[text.length() / 2];
        for (int i = 0; i < bytes.length; i++) {
            int high = digit(text.charAt(i * 2));
            int low = digit(text.charAt(i * 2 + 1));
            if (high < 0 || low < 0) throw new BundleRefused(what + " is no hex");
            bytes[i] = (byte) ((high << 4) | low);
        }
        return bytes;
    }

    static boolean isHex(String text, int length) {
        if (text.length() != length) return false;
        for (int i = 0; i < length; i++) if (digit(text.charAt(i)) < 0) return false;
        return true;
    }

    private static int digit(char c) {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        return -1;
    }
}
