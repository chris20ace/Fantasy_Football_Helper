import XCTest
@testable import SundayDesk

final class UrlPolicyTests: XCTestCase {
    func testSetupRequiresExactOriginAndPath() {
        XCTAssertTrue(UrlPolicy.isSetup(UrlPolicy.setupURL))
        XCTAssertTrue(UrlPolicy.isSetup(URL(string: UrlPolicy.appOrigin + "/setup?step=espn")))
        let rejected = [
            "http://fantasy-football-helper-orcin.vercel.app/setup",
            "https://fantasy-football-helper-orcin.vercel.app.attacker.test/setup",
            "https://fantasy-football-helper-orcin.vercel.app@attacker.test/setup",
            "https://user@fantasy-football-helper-orcin.vercel.app/setup",
            "https://fantasy-football-helper-orcin.vercel.app:444/setup",
            "https://fantasy-football-helper-orcin.vercel.app/login",
            "https://fantasy-football-helper-orcin.vercel.app/%73etup",
            "https://fantasy-football-helper-orcin.vercel.app/setup/",
            "https://www.espn.com/setup", "javascript:alert(1)", "file:///setup"
        ]
        rejected.forEach { XCTAssertFalse(UrlPolicy.isSetup(URL(string: $0)), $0) }
        XCTAssertFalse(UrlPolicy.isSetup(nil))
    }

    func testProviderDomainBoundaries() {
        ["https://www.espn.com/fantasy/football/", "https://registerdisney.go.com/", "https://disneyid.disney.com/"]
            .forEach { XCTAssertTrue(UrlPolicy.isProvider(URL(string: $0))) }
        ["https://notespn.com/", "https://espn.com.attacker.test/", "http://espn.com/", "https://espn.com@attacker.test/"]
            .forEach { XCTAssertFalse(UrlPolicy.isProvider(URL(string: $0))) }
    }

    func testSessionAndRequestValidation() {
        let id = "00000000-0000-4000-8000-000000000001"
        XCTAssertTrue(UrlPolicy.isRequestId(id))
        XCTAssertFalse(UrlPolicy.isRequestId("arbitrary-id"))
        XCTAssertTrue(EspnSession.isValid("abcdefghijklmnop", "{" + id + "}"))
        XCTAssertFalse(EspnSession.isValid("", "{" + id + "}"))
        XCTAssertFalse(EspnSession.isValid("abcdefghijklmnop\r\n", "{" + id + "}"))
        XCTAssertFalse(EspnSession.isValid("abcdefghijklmnop;other=x", "{" + id + "}"))
        XCTAssertFalse(EspnSession.isValid("abcdefghijklmnop", id))
    }
}
