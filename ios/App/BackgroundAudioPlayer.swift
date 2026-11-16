import Foundation
import AVFoundation
import MediaPlayer

struct JabouStreamResponse: Decodable {
    let audioStreams: [JabouAudioStream]?
}
struct JabouAudioStream: Decodable {
    let url: String?
    let format: String?
    let bitrate: Int?
}

@MainActor
final class BackgroundAudioPlayer: ObservableObject {
    @Published var title = "JabouTube"
    @Published var status = "Lecteur iOS prêt"
    @Published var isPlaying = false
    @Published var ready = false
    @Published var hasRequestedAudio = false

    private var player: AVPlayer?
    private var currentTask: Task<Void,Never>?
    private var playerObserver: NSKeyValueObservation?
    private var timeObserver: Any?
    private var playSession: UUID = UUID()
    private var remoteCommandsInstalled = false

    func play(videoId: String, title: String, position: Double, familySession: String) {
        guard videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else {
            status = "Identifiant de vidéo incorrect"; return
        }
        guard !familySession.isEmpty, familySession.count < 1000 else {
            status = "Connexion familiale nécessaire"; return
        }
        currentTask?.cancel()
        stopPlayer()
        let requestID = UUID()
        playSession = requestID
        self.title = String(title.prefix(200))
        self.status = "Recherche du flux audio compatible…"
        self.hasRequestedAudio = true
        self.ready = false
        currentTask = Task { [weak self] in
            do {
                guard let self = self else { return }
                let url = URL(string: "https://jaboutude-server.onrender.com/api/streams/" + videoId)!
                var request = URLRequest(url: url)
                request.timeoutInterval = 20
                request.cachePolicy = .reloadIgnoringLocalCacheData
                request.setValue("Bearer " + familySession, forHTTPHeaderField: "Authorization")
                let (data, response) = try await URLSession.shared.data(for: request)
                try Task.checkCancellation()
                guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                    throw NSError(domain: "JabouTube", code: 1,
                                  userInfo: [NSLocalizedDescriptionKey: "Le serveur vidéo ne fournit pas de flux (HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0))."])
                }
                let payload = try JSONDecoder().decode(JabouStreamResponse.self, from: data)
                let choices = (payload.audioStreams ?? []).compactMap { stream -> (URL, Int)? in
                    guard let raw = stream.url, let candidate = URL(string: raw), candidate.scheme == "https",
                        let host = candidate.host, !host.isEmpty else { return nil }
                    if host == "localhost" || host.hasSuffix(".local") || host == "127.0.0.1" { return nil }
                    var score = 0
                    let codec = stream.format ?? ""
                    if codec.contains("mp4a.40.2") { score += 1000 }
                    if codec.contains("audio/mp4") { score += 200 }
                    score -= abs((stream.bitrate ?? 128000) - 128000) / 1000
                    return (candidate, score)
                }
                guard let best = choices.max(by: { $0.1 < $1.1 }) else {
                    throw NSError(domain: "JabouTube",code: 2,userInfo:
                                  [NSLocalizedDescriptionKey: "Aucun flux audio compatible disponible pour cette vidéo."])
                }
                try Task.checkCancellation()
                guard self.playSession == requestID else { return }
                try self.startPlayer(url: best.0, position: position)
            } catch is CancellationError {
                return
            } catch {
                guard self?.playSession == requestID else { return }
                self?.status = "Audio non disponible : " + error.localizedDescription
                self?.ready = false
                self?.isPlaying = false
            }
        }
    }

    private func startPlayer(url: URL, position: Double) throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default)
        try session.setActive(true)
        let newItem = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: newItem)
        player?.automaticallyWaitsToMinimizeStalling = true
        if position > 0 {
            player?.seek(to: CMTime(seconds: min(position, 86400), preferredTimescale: 1000))
        }
        ready = true
        isPlaying = true
        status = "Lecture native iOS · verrouillage autorisé"
        setupRemoteCommands()
        updateNowPlaying()
        player?.play()
        playerObserver = newItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            if item.status == .failed {
                let message = item.error?.localizedDescription ?? "Format audio indisponible"
                Task { @MainActor [weak self] in
                    self?.status = "Lecture échouée : " + message
                    self?.isPlaying = false
                    self?.ready = false
                }
            }
        }
        timeObserver = player?.addPeriodicTimeObserver(forInterval: CMTime(seconds: 1, preferredTimescale: 1), queue: .main) {
            [weak self] _ in
            Task { @MainActor [weak self] in self?.updateNowPlaying() }
        }
    }

    func toggle() {
        guard ready else { return }
        if isPlaying { player?.pause(); isPlaying = false; status = "Lecture en pause" }
        else { player?.play(); isPlaying = true; status = "Lecture audio native iOS" }
        updateNowPlaying()
    }

    func stop() {
        playSession = UUID()
        currentTask?.cancel()
        stopPlayer()
        hasRequestedAudio = false
        status = "Arrêté"
    }
    private func stopPlayer() {
        playerObserver?.invalidate();playerObserver=nil
        if let listener = timeObserver { player?.removeTimeObserver(listener) }
        timeObserver = nil
        player?.pause()
        player?.replaceCurrentItem(with:nil)
        player = nil
        ready = false
        isPlaying = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
    private func setupRemoteCommands() {
        guard !remoteCommandsInstalled else { return }
        remoteCommandsInstalled = true
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor [weak self] in
                if self?.isPlaying == false { self?.toggle() }
            }
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor [weak self] in
                if self?.isPlaying == true { self?.toggle() }
            }
            return .success
        }
    }
    private func updateNowPlaying() {
        guard let player else { return }
        var info: [String:Any] = [
            MPMediaItemPropertyTitle: title,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: CMTimeGetSeconds(player.currentTime()).isFinite ?
                CMTimeGetSeconds(player.currentTime()) : 0,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]
        let duration = CMTimeGetSeconds(player.currentItem?.duration ?? .invalid)
        if duration.isFinite, duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
