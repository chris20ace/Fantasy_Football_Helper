package dev.acebuilds.sundaydesk;

import org.junit.Test;
import static org.junit.Assert.*;

public class UrlPolicyTest {
    @Test public void setupRequiresExactFirstPartyOriginAndPath() {
        assertTrue(UrlPolicy.isSetup(UrlPolicy.SETUP_URL));
        assertTrue(UrlPolicy.isSetup(UrlPolicy.SETUP_URL + "?step=espn"));
        String[] rejected = {
            "http://fantasy-football-helper-orcin.vercel.app/setup",
            "https://fantasy-football-helper-orcin.vercel.app.attacker.test/setup",
            "https://fantasy-football-helper-orcin.vercel.app@attacker.test/setup",
            "https://user@fantasy-football-helper-orcin.vercel.app/setup",
            "https://fantasy-football-helper-orcin.vercel.app:444/setup",
            "https://fantasy-football-helper-orcin.vercel.app/login",
            "https://fantasy-football-helper-orcin.vercel.app/%73etup",
            "https://fantasy-football-helper-orcin.vercel.app/setup/",
            "https://www.espn.com/setup", "javascript:alert(1)", "file:///setup", null
        };
        for (String url : rejected) assertFalse("Should reject " + url, UrlPolicy.isSetup(url));
    }

    @Test public void providerAllowsOwnedDomainsAndRejectsLookalikes() {
        assertTrue(UrlPolicy.isProvider("https://www.espn.com/fantasy/football/"));
        assertTrue(UrlPolicy.isProvider("https://registerdisney.go.com/"));
        assertTrue(UrlPolicy.isProvider("https://disneyid.disney.com/"));
        assertFalse(UrlPolicy.isProvider("https://notespn.com/"));
        assertFalse(UrlPolicy.isProvider("https://espn.com.attacker.test/"));
        assertFalse(UrlPolicy.isProvider("http://espn.com/"));
        assertFalse(UrlPolicy.isProvider("https://espn.com@attacker.test/"));
    }

    @Test public void requestAndSessionValidation() {
        String id = "00000000-0000-4000-8000-000000000001";
        assertTrue(UrlPolicy.isRequestId(id));
        assertFalse(UrlPolicy.isRequestId("arbitrary-id"));
        assertFalse(UrlPolicy.isRequestId("1-1-1-1-1"));
        assertTrue(EspnSession.isValid("abcdefghijklmnop", "{" + id + "}"));
        assertFalse(EspnSession.isValid("", "{" + id + "}"));
        assertFalse(EspnSession.isValid("abcdefghijklmnop\r\n", "{" + id + "}"));
        assertFalse(EspnSession.isValid("abcdefghijklmnop;other=x", "{" + id + "}"));
        assertFalse(EspnSession.isValid("abcdefghijklmnop", id));
        assertEquals("value=with=padding", EspnSession.cookie("ignored=x; espn_s2=value=with=padding; SWID=fake", "espn_s2"));
        assertNull(EspnSession.cookie("other=x", "espn_s2"));
    }
}
