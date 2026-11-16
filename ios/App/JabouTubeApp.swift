import SwiftUI
import WebKit

@main
struct JabouTubeApp: App {
    @StateObject private var audio = BackgroundAudioPlayer()
    @State private var showingInvitation = false
    @State private var invitationText = ""
    @State private var selectedURL = URL(string: "https://jaboutude-server.onrender.com")!

    var body: some Scene {
        WindowGroup {
            VStack(spacing: 0) {
                HStack {
                    Text("JabouTube").font(.headline)
                    Spacer()
                    Button("Lien familial") { showingInvitation = true }
                        .font(.footnote)
                }
                .padding(.horizontal, 15)
                .padding(.vertical, 8)
                .background(Color(UIColor.systemBackground))

                JabouWebView(audio: audio, requestedURL: selectedURL)

                if audio.hasRequestedAudio {
                    HStack(spacing: 12) {
                        Image(systemName: "music.note").foregroundColor(.pink)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(audio.title).font(.subheadline).fontWeight(.semibold).lineLimit(1)
                            Text(audio.status).font(.caption).foregroundColor(.secondary).lineLimit(2)
                        }
                        Spacer(minLength: 4)
                        Button(action: { audio.toggle() }) {
                            Image(systemName: audio.isPlaying ? "pause.fill" : "play.fill")
                                .frame(width: 40, height: 40)
                        }
                        .disabled(!audio.ready)
                        Button(action: { audio.stop() }) {
                            Image(systemName: "stop.fill").frame(width: 32, height: 40)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Color(UIColor.secondarySystemBackground))
                }
            }
            .background(Color.black)
            .sheet(isPresented: $showingInvitation) {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Connecter ton espace familial").font(.title2).bold()
                    Text("Colle ici le lien d'invitation JabouTube personnel. Après la première ouverture, ta session restera dans l'application.")
                        .font(.subheadline)
                    TextField("https://jaboutude-server.onrender.com/#invite=…", text: $invitationText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textFieldStyle(.roundedBorder)
                    Button("Ouvrir mon invitation") {
                        let text = invitationText.trimmingCharacters(in: .whitespacesAndNewlines)
                        if let url = URL(string: text),
                           url.scheme == "https",
                           url.host == "jaboutude-server.onrender.com",
                           url.fragment?.hasPrefix("invite=") == true {
                            selectedURL = url
                            showingInvitation = false
                            invitationText = ""
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    Spacer()
                }
                .padding(24)
            }
        }
    }
}
