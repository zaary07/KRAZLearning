import SwiftUI
import WebKit

struct JabouWebView: UIViewRepresentable {
    @ObservedObject var audio: BackgroundAudioPlayer
    let requestedURL: URL
    func makeCoordinator() -> Coordinator { Coordinator(audio: audio) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(context.coordinator, name: "JabouNative")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor.black
        web.scrollView.backgroundColor = UIColor.black
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        context.coordinator.lastLoadedURL = requestedURL.absoluteString
        web.load(URLRequest(url: requestedURL))
        context.coordinator.webView = web
        return web
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {
        if context.coordinator.lastLoadedURL != requestedURL.absoluteString {
            context.coordinator.lastLoadedURL = requestedURL.absoluteString
            uiView.load(URLRequest(url: requestedURL))
        }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let audio: BackgroundAudioPlayer
        weak var webView: WKWebView?
        var lastLoadedURL: String = ""
        init(audio:BackgroundAudioPlayer) {self.audio=audio}

        func userContentController(_ controller: WKUserContentController,didReceive message: WKScriptMessage) {
            guard message.name == "JabouNative",
                  message.frameInfo.securityOrigin.protocol == "https",
                  ["jaboutude-server.onrender.com","jaboutude-ios.onrender.com"]
                   .contains(message.frameInfo.securityOrigin.host),
                  let data=message.body as? [String:Any],
                  data["type"] as? String == "playAudio",
                  let id=data["id"] as? String,
                  let token=data["session"] as? String else { return }
            let title=data["title"] as? String ?? "JabouTube"
            let pos=(data["position"] as? NSNumber)?.doubleValue ?? 0
            audio.play(videoId:id,title:title,position:pos,familySession:token)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy)->Void) {
            guard let url=navigationAction.request.url else {decisionHandler(.cancel);return}
            let host=url.host ?? ""
            if url.scheme == "https" &&
               (host == "jaboutude-server.onrender.com" || host == "jaboutude-ios.onrender.com") {
                decisionHandler(.allow)
            } else if url.scheme == "https" {
                // Normal external links (Google login, links, YouTube) use Safari.
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}
