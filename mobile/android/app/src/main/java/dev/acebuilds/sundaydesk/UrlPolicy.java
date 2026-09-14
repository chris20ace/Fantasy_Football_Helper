package dev.acebuilds.sundaydesk;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

/** Shared policy has no Android dependencies, so it can be unit tested on the JVM. */
final class UrlPolicy {
    static final String APP_ORIGIN = "https://fantasy-football-helper-orcin.vercel.app";
    static final String SETUP_URL = APP_ORIGIN + "/setup";
    static final String ESPN_URL = "https://www.espn.com/fantasy/football/";
    private static final String APP_HOST = "fantasy-football-helper-orcin.vercel.app";
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private static URI secure(String value) {
        try {
            URI url = new URI(value);
            if (!"https".equalsIgnoreCase(url.getScheme()) || url.getHost() == null
                || url.getRawUserInfo() != null || (url.getPort() != -1 && url.getPort() != 443)) return null;
            return url;
        } catch (Exception ignored) { return null; }
    }

    static boolean isApp(String value) {
        URI url = secure(value);
        return url != null && APP_HOST.equalsIgnoreCase(url.getHost());
    }

    static boolean isSetup(String value) {
        URI url = secure(value);
        return url != null && APP_HOST.equalsIgnoreCase(url.getHost()) && "/setup".equals(url.getRawPath());
    }

    static boolean isProvider(String value) {
        URI url = secure(value);
        if (url == null) return false;
        String host = url.getHost().toLowerCase(Locale.ROOT);
        return inDomain(host, "espn.com") || inDomain(host, "go.com") || inDomain(host, "disney.com");
    }

    static boolean inDomain(String host, String domain) {
        return host.equals(domain) || host.endsWith("." + domain);
    }

    static boolean isRequestId(String value) { return value != null && UUID.matcher(value).matches(); }
}
