package dev.acebuilds.sundaydesk;

import java.util.regex.Pattern;

final class EspnSession {
    private static final Pattern SWID = Pattern.compile("^\\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\}$");
    static boolean isValid(String s2, String swid) {
        return s2 != null && s2.length() >= 16 && s2.length() <= 8192
            && s2.indexOf('\r') < 0 && s2.indexOf('\n') < 0 && s2.indexOf(';') < 0
            && swid != null && SWID.matcher(swid).matches();
    }
    static String cookie(String header, String name) {
        if (header == null) return null;
        for (String item : header.split(";")) {
            int equals = item.indexOf('=');
            if (equals > 0 && item.substring(0, equals).trim().equals(name)) return item.substring(equals + 1).trim();
        }
        return null;
    }
}
