import UIKit
import WebKit

/// A fresh ephemeral provider browser with no Sunday Desk JavaScript handler or injected scripts.
final class EspnSignInController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private let status = UILabel()
    private let continueButton = UIButton(type: .system)
    private var finished = false
    private var completion: ((EspnSession?) -> Void)?

    init(completion: @escaping (EspnSession?) -> Void) {
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("Use init(completion:)") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let heading = UILabel()
        heading.text = "Connect ESPN"
        heading.font = .preferredFont(forTextStyle: .title2)
        heading.adjustsFontForContentSizeCategory = true
        status.text = "Sign in directly with ESPN, then tap Continue. Sunday Desk receives your ESPN session, never your password."
        status.font = .preferredFont(forTextStyle: .subheadline)
        status.adjustsFontForContentSizeCategory = true
        status.numberOfLines = 0
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        if #available(iOS 16.4, *) { webView.isInspectable = false }
        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        continueButton.setTitle("Continue", for: .normal)
        continueButton.configuration = .filled()
        continueButton.addTarget(self, action: #selector(continueTapped), for: .touchUpInside)
        let actions = UIStackView(arrangedSubviews: [cancelButton, continueButton])
        actions.axis = .horizontal
        actions.distribution = .fillEqually
        actions.spacing = 12
        let header = UIStackView(arrangedSubviews: [heading, status])
        header.axis = .vertical
        header.spacing = 6
        [header, webView!, actions].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; view.addSubview($0) }
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            webView.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 12),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: actions.topAnchor, constant: -12),
            actions.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            actions.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            actions.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
            actions.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12)
        ])
        webView.load(URLRequest(url: UrlPolicy.espnURL))
    }

    @objc private func cancelTapped() { finish(nil) }

    @objc private func continueTapped() {
        guard !finished, UrlPolicy.isProvider(webView.url) else { return }
        continueButton.isEnabled = false
        // Read only this modal's cookie store, only following the native Continue tap.
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self, !self.finished else { return }
            self.continueButton.isEnabled = true
            let owned = cookies.filter {
                let domain = $0.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
                return (domain == "espn.com" || domain == "fantasy.espn.com") && $0.path == "/"
                    && ($0.expiresDate == nil || $0.expiresDate! > Date())
            }
            guard let s2 = owned.first(where: { $0.name == "espn_s2" })?.value,
                  let swid = owned.first(where: { $0.name == "SWID" })?.value,
                  EspnSession.isValid(s2, swid) else {
                self.status.text = "Finish signing in to ESPN first, then tap Continue. If you see a sign-in button, use it above."
                return
            }
            self.finish(EspnSession(s2: s2, swid: swid))
        }
    }

    private func finish(_ session: EspnSession?) {
        guard !finished else { return }
        let callback = completion
        discard()
        callback?(session)
    }

    func discard() {
        finished = true
        completion = nil
        webView?.stopLoading()
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        // Ephemeral store is dropped with the modal. Clear its contents immediately as well.
        webView?.configuration.websiteDataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
            modifiedSince: .distantPast, completionHandler: {})
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame?.isMainFrame == false {
            // Provider-owned HTTPS identity/challenge frames have no Sunday Desk native bridge.
            let url = navigationAction.request.url
            decisionHandler(url?.scheme == "https" || url?.absoluteString == "about:blank" ? .allow : .cancel)
            return
        }
        guard UrlPolicy.isProvider(navigationAction.request.url) else {
            if navigationAction.targetFrame?.isMainFrame != false {
                status.text = "That link is outside ESPN sign-in. Stay here to finish connecting."
            }
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if UrlPolicy.isProvider(navigationAction.request.url) { webView.load(navigationAction.request) }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled {
            status.text = "ESPN could not load. Check your connection, or cancel and try again."
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(nil) }
}
