package com.jaboutube.background;

import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public final class MobileDownloader extends Downloader {
    @Override
    public Response execute(Request req) throws IOException {
        final URL target = new URL(req.url());
        if (!"https".equalsIgnoreCase(target.getProtocol()))
            throw new IOException("Seules les requêtes HTTPS sont autorisées.");
        HttpURLConnection conn = (HttpURLConnection) target.openConnection();
        try {
            conn.setConnectTimeout(12000);
            conn.setReadTimeout(15000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod(req.httpMethod());
            conn.setRequestProperty("User-Agent","Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0");
            conn.setRequestProperty("Accept-Encoding","identity");
            if (req.headers() != null) {
                for (Map.Entry<String, List<String>> e : req.headers().entrySet()) {
                    for (String value : e.getValue()) conn.addRequestProperty(e.getKey(), value);
                }
            }
            if (req.dataToSend() != null && req.dataToSend().length != 0) {
                conn.setDoOutput(true);
                conn.getOutputStream().write(req.dataToSend());
                conn.getOutputStream().close();
            }
            int status = conn.getResponseCode();
            InputStream source = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            String body = "";
            if (source != null) {
                try (InputStream input = source; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = input.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        if (out.size() > 7_000_000) throw new IOException("Réponse trop volumineuse.");
                    }
                    body = out.toString(StandardCharsets.UTF_8.name());
                }
            }
            return new Response(status, conn.getResponseMessage(), conn.getHeaderFields(), body, conn.getURL().toString());
        } finally {
            conn.disconnect();
        }
    }
}
