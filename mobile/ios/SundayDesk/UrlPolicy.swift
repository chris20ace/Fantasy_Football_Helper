import Foundation

enum UrlPolicy {
    static let appHost = "fantasy-football-helper-orcin.vercel.app"
    static let appOrigin = "https://" + appHost
    static let setupURL = URL(string: appOrigin + "/setup")!
    static let espnURL = URL(string: "https://www.espn.com/fantasy/football/")!

    private static func secure(_ url: URL?) -> URLComponents? {
        guard let url, let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https", components.host != nil,
              components.user == nil, components.password == nil,
              components.port == nil || components.port == 443 else { return nil }
        return components
    }

    static func isApp(_ url: URL?) -> Bool {
        guard let components = secure(url) else { return false }
        return components.host?.lowercased() == appHost
    }

    static func isSetup(_ url: URL?) -> Bool {
        guard let components = secure(url) else { return false }
        return components.host?.lowercased() == appHost && components.percentEncodedPath == "/setup"
    }

    static func isProvider(_ url: URL?) -> Bool {
        guard let components = secure(url), let host = components.host?.lowercased() else { return false }
        return ["espn.com", "go.com", "disney.com"].contains { inDomain(host, $0) }
    }

    static func inDomain(_ host: String, _ domain: String) -> Bool {
        host == domain || host.hasSuffix("." + domain)
    }

    static func isRequestId(_ id: String) -> Bool {
        id.count == 36 && UUID(uuidString: id) != nil
    }
}

struct EspnSession {
    let s2: String
    let swid: String

    static func isValid(_ s2: String, _ swid: String) -> Bool {
        (16...8192).contains(s2.count) && !s2.contains("\r") && !s2.contains("\n") && !s2.contains(";")
            && swid.count == 38 && swid.first == "{" && swid.last == "}"
            && UUID(uuidString: String(swid.dropFirst().dropLast())) != nil
    }
}
