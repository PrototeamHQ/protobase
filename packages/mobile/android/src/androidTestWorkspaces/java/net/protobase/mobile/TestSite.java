package net.protobase.mobile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * A web server on the device's loopback for the workspace view tests: each request gets the page `pages` names for
 * its path, or a 404, and one connection serves one request. The request's Cookie header is in `{cookie}` of a page.
 */
final class TestSite implements AutoCloseable {

    static final class Page {
        final String body;
        final Map<String, String> headers;

        Page(String body, Map<String, String> headers) {
            this.body = body;
            this.headers = headers;
        }

        Page(String body) {
            this(body, Map.of());
        }
    }

    private final ServerSocket socket;
    private final Map<String, Page> pages;

    TestSite(Map<String, Page> pages) throws IOException {
        this.pages = pages;
        socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
        Thread thread = new Thread(this::serve, "test-site");
        thread.setDaemon(true);
        thread.start();
    }

    int port() {
        return socket.getLocalPort();
    }

    @Override
    public void close() throws IOException {
        socket.close();
    }

    private void serve() {
        while (true) {
            try (Socket connection = socket.accept()) {
                answer(connection);
            } catch (SocketException closed) {
                return;
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    private void answer(Socket connection) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
        String[] requestLine = String.valueOf(reader.readLine()).split(" ");
        String path = requestLine.length > 1 ? requestLine[1].split("\\?")[0] : "/";
        String cookie = "";
        for (String line = reader.readLine(); line != null && !line.isEmpty(); line = reader.readLine()) {
            if (line.toLowerCase().startsWith("cookie:")) cookie = line.substring(7).trim();
        }
        Page page = pages.get(path);
        OutputStream out = connection.getOutputStream();
        if (page == null) {
            out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            return;
        }
        byte[] body = page.body.replace("{cookie}", cookie).getBytes(StandardCharsets.UTF_8);
        StringBuilder head = new StringBuilder("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\n");
        head.append("Content-Length: ").append(body.length).append("\r\n");
        page.headers.forEach((name, value) -> head.append(name).append(": ").append(value).append("\r\n"));
        out.write(head.append("\r\n").toString().getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }
}
