package net.protobase.mobile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.io.UnsupportedEncodingException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The releases URL on loopback, on a plain socket so it runs on the JVM and on a device alike: answers
 * `GET /releases/<id>?href=` from what a test puts in `answers`, one request per connection, and records each asked.
 */
final class ReleaseServer implements AutoCloseable {

    final Map<String, byte[]> answers = Collections.synchronizedMap(new HashMap<>());
    final List<String> asked = Collections.synchronizedList(new ArrayList<>());
    volatile String redirect;
    private final ServerSocket socket;

    ReleaseServer(int port) throws IOException {
        socket = new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"));
        Thread thread = new Thread(this::serve, "release-server");
        thread.setDaemon(true);
        thread.start();
    }

    ReleaseServer() throws IOException {
        this(0);
    }

    private void serve() {
        while (!socket.isClosed()) {
            try (Socket client = socket.accept()) {
                answer(client);
            } catch (IOException e) {
                if (socket.isClosed()) return;
                throw new UncheckedIOException(e);
            }
        }
    }

    private void answer(Socket client) throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.ISO_8859_1));
        String line = in.readLine();
        for (String header = in.readLine(); header != null && !header.isEmpty(); header = in.readLine()) {}
        OutputStream out = client.getOutputStream();
        String target = line == null ? "" : line.split(" ")[1];
        int query = target.indexOf("?href=");
        if (!target.startsWith("/releases/") || query < 0) {
            respond(out, "404 Not Found", "", null);
            return;
        }
        String key = target.substring("/releases/".length(), query) + "?" + decode(target.substring(query + "?href=".length()));
        asked.add(key);
        if (redirect != null) {
            respond(out, "302 Found", "Location: " + redirect + "\r\n", null);
            return;
        }
        byte[] body = answers.get(key);
        if (body == null) respond(out, "404 Not Found", "", null);
        else respond(out, "200 OK", "", body);
    }

    private static void respond(OutputStream out, String status, String headers, byte[] body) throws IOException {
        byte[] content = body == null ? new byte[0] : body;
        out.write(("HTTP/1.1 " + status + "\r\n" + headers + "Content-Length: " + content.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        out.write(content);
        out.flush();
    }

    private static String decode(String value) throws UnsupportedEncodingException {
        return URLDecoder.decode(value, "UTF-8");
    }

    String url() {
        return "http://127.0.0.1:" + socket.getLocalPort() + "/releases";
    }

    /** Serves `release` under `id`, as the server serves it under its own. */
    void serve(TestRelease release, String id) {
        answers.put(id + "?" + ReleaseStatement.FILE, release.statement);
        answers.put(id + "?" + ReleaseManifest.FILE, release.manifest);
        for (Map.Entry<String, byte[]> file : release.files.entrySet()) answers.put(id + "?" + file.getKey(), file.getValue());
    }

    void serve(TestRelease release) {
        serve(release, release.bundleId);
    }

    @Override
    public void close() throws IOException {
        socket.close();
    }
}
