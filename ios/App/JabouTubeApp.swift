import SwiftUI
import WebKit

@main
struct JabouTubeApp: App {
    @StateObject private var audio = BackgroundAudioPlayer()
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 0) {
                JabouWebView(audio: audio)
                if audio.hasRequestedAudio {
                    HStack(spacing: 12) {
                        Image(systemName: "music.note")
                            .foregroundColor(.pink)
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
                            Image(systemName: "stop.fill")
                                .frame(width: 32, height: 40)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Color(UIColor.secondarySystemBackground))
                }
            }
            .background(Color.black)
        }
    }
}
