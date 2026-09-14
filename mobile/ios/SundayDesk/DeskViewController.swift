import UIKit
import WebKit

private final class WeakReplyHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var owner: DeskViewController?
    init(_ owner: DeskViewController) { self.owner = owner }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let owner else { replyHandler(nil, "Sunday Desk is closed."); return }
        owner.userContentController(userContentController, didReceive: message, replyHandler: replyHandler)
    }
}

final class DeskViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    private var webView: WKWebView!
    private var documentVersion = 0
    private var operation: PendingConnection?
    private var timeout: Timer?
    private weak var signIn: EspnSignInController?

    private struct PendingConnection {
        let id: String
        let document: Int
        let reply: (Any?, String?) -> Void
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.addScriptMessageHandler(WeakReplyHandler(self), contentWorld: .page, name: "SundayDeskEspn")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        if #available(iOS 16.4, *) { webView.isInspectable = false }
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        webView.load(URLRequest(url: UrlPolicy.setupURL))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let input = message.body as? [String: Any], input.count <= 3,
              let id = input["requestId"] as? String, UrlPolicy.isRequestId(id),
              let command = input["command"] as? String else {
            replyHandler(nil, "Invalid ESPN connector request.")
            return
        }
        let origin = message.frameInfo.securityOrigin
        guard message.webView === webView, message.frameInfo.isMainFrame,
              origin.protocol == "https", origin.host.lowercased() == UrlPolicy.appHost,
              origin.port == 0 || origin.port == 443,
              UrlPolicy.isSetup(message.frameInfo.request.url), UrlPolicy.isSetup(webView.url) else {
            replyHandler(failure(id, command, "UNTRUSTED_ORIGIN", "Open Sunday Desk Setup to connect ESPN."), nil)
            return
        }
        switch command {
        case "status":
            replyHandler(["requestId": id, "command": command, "success": true, "available": true, "version": 1], nil)
        case "connect":
            guard operation == nil, presentedViewController == nil else {
                replyHandler(failure(id, command, "BUSY", "An ESPN connection is already open."), nil)
                return
            }
            operation = PendingConnection(id: id, document: documentVersion, reply: replyHandler)
            let controller = EspnSignInController { [weak self] session in self?.complete(session) }
            controller.modalPresentationStyle = .fullScreen
            signIn = controller
            timeout = Timer.scheduledTimer(withTimeInterval: 600, repeats: false) { [weak self] _ in
                self?.cancel("TIMEOUT", "ESPN sign-in timed out. Please try again.")
            }
            present(controller, animated: true)
        case "cancel":
            if operation?.id == id { cancel("CANCELLED", "ESPN connection cancelled.") }
            replyHandler(["requestId": id, "command": command, "success": true], nil)
        default:
            replyHandler(failure(id, command, "UNSUPPORTED", "Unknown ESPN connector command."), nil)
        }
    }

    private func complete(_ session: EspnSession?) {
        guard let pending = operation else { return }
        operation = nil
        timeout?.invalidate(); timeout = nil
        signIn?.discard(); signIn?.dismiss(animated: true); signIn = nil
        // Reply belongs to the invoking JS promise; never evaluate JS in a new document.
        guard pending.document == documentVersion, UrlPolicy.isSetup(webView.url) else {
            pending.reply(nil, "The page changed. Start the ESPN connection again.")
            return
        }
        guard let session, EspnSession.isValid(session.s2, session.swid) else {
            pending.reply(failure(pending.id, "connect", "CANCELLED", "ESPN connection cancelled."), nil)
            return
        }
        pending.reply(["requestId": pending.id, "command": "connect", "success": true,
                       "s2": session.s2, "swid": session.swid], nil)
    }

    private func cancel(_ code: String, _ message: String) {
        guard let pending = operation else { return }
        operation = nil
        timeout?.invalidate(); timeout = nil
        signIn?.discard(); signIn?.dismiss(animated: false); signIn = nil
        pending.reply(failure(pending.id, "connect", code, message), nil)
    }

    private func failure(_ id: String, _ command: String, _ code: String, _ message: String) -> [String: Any] {
        ["requestId": id, "command": command, "success": false, "error": ["code": code, "message": message]]
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard navigationAction.targetFrame?.isMainFrame != false else { decisionHandler(.allow); return }
        if UrlPolicy.isApp(navigationAction.request.url) { decisionHandler(.allow); return }
        cancel("CANCELLED", "ESPN connection cancelled.")
        // External links use the system browser; its documents never receive the bridge.
        if let url = navigationAction.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        cancel("CANCELLED", "The page changed. Start the connection again.")
        documentVersion += 1
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if UrlPolicy.isApp(navigationAction.request.url) { webView.load(navigationAction.request) }
        else if let url = navigationAction.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        let alert = UIAlertController(title: "Sunday Desk could not load", message: "Check your connection and try again.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in self?.webView.load(URLRequest(url: UrlPolicy.setupURL)) })
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        if presentedViewController == nil { present(alert, animated: true) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        cancel("CANCELLED", "The app was interrupted. Start the connection again.")
        webView.reload()
    }

    deinit {
        timeout?.invalidate()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "SundayDeskEspn", contentWorld: .page)
    }
}
