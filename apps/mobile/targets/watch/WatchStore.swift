import Foundation

// Saat telefona doğrudan bağlanmaz: sunucudan bir eşleştirme kodu alır, kullanıcı kodu telefondaki
// Ayarlar > Saati bağla ekranında onaylar, saat kendi oturum anahtarını alıp özeti sunucudan çeker.
struct WatchSummary: Decodable {
  struct Envelope: Decodable, Identifiable {
    let id: String
    let name: String
    let icon: String
    let remaining: Int
  }
  let name: String
  let left: Int
  let daysLeft: Int
  let perDay: Int
  let streak: Int
  let envelopes: [Envelope]
}

private struct PairResponse: Decodable {
  let code: String
  let deviceSecret: String
}

private struct ClaimResponse: Decodable {
  let token: String?
  let pending: Bool?
}

@MainActor
final class WatchStore: ObservableObject {
  enum Phase {
    case loading
    case pairing(code: String)
    case ready(WatchSummary)
    case failed(String)
  }

  @Published var phase: Phase = .loading

  private let defaults = UserDefaults.standard
  private var pollTask: Task<Void, Never>?

  // Sunucu adresi Info.plist'teki KumbaraAPIURL anahtarından okunur, yoksa varsayılan kullanılır
  private var baseURL: URL {
    let raw = (Bundle.main.object(forInfoDictionaryKey: "KumbaraAPIURL") as? String) ?? "https://kumbara.example.com"
    return URL(string: raw.trimmingCharacters(in: CharacterSet(charactersIn: "/")))!
  }

  private var token: String? {
    get { defaults.string(forKey: "token") }
    set { defaults.set(newValue, forKey: "token") }
  }

  func start() {
    if token != nil {
      Task { await refresh() }
    } else {
      Task { await beginPairing() }
    }
  }

  func refresh() async {
    guard let token else {
      await beginPairing()
      return
    }
    var req = URLRequest(url: baseURL.appendingPathComponent("api/watch/summary"))
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue(TimeZone.current.identifier, forHTTPHeaderField: "X-Timezone")
    do {
      let (data, res) = try await URLSession.shared.data(for: req)
      let status = (res as? HTTPURLResponse)?.statusCode ?? 0
      if status == 401 {
        // Oturum telefondan kapatıldıysa yeniden eşleştirilir
        self.token = nil
        await beginPairing()
        return
      }
      phase = .ready(try JSONDecoder().decode(WatchSummary.self, from: data))
    } catch {
      phase = .failed("Sunucuya ulaşılamadı")
    }
  }

  func beginPairing() async {
    pollTask?.cancel()
    var req = URLRequest(url: baseURL.appendingPathComponent("api/watch/pair"))
    req.httpMethod = "POST"
    do {
      let (data, _) = try await URLSession.shared.data(for: req)
      let pair = try JSONDecoder().decode(PairResponse.self, from: data)
      phase = .pairing(code: pair.code)
      poll(code: pair.code, secret: pair.deviceSecret)
    } catch {
      phase = .failed("Eşleştirme başlatılamadı")
    }
  }

  // Kullanıcı kodu onaylayana kadar 3 saniyede bir sorulur (kod 10 dakika geçerli)
  private func poll(code: String, secret: String) {
    pollTask = Task {
      for _ in 0..<200 {
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        if Task.isCancelled { return }
        var req = URLRequest(url: baseURL.appendingPathComponent("api/watch/claim"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code, "deviceSecret": secret])
        guard let (data, res) = try? await URLSession.shared.data(for: req) else { continue }
        if (res as? HTTPURLResponse)?.statusCode == 404 {
          await beginPairing()
          return
        }
        if let claim = try? JSONDecoder().decode(ClaimResponse.self, from: data), let token = claim.token {
          self.token = token
          await refresh()
          return
        }
      }
    }
  }

  func unpair() {
    token = nil
    Task { await beginPairing() }
  }
}

func formatTL(_ kurus: Int) -> String {
  let f = NumberFormatter()
  f.numberStyle = .currency
  f.currencyCode = "TRY"
  f.locale = Locale(identifier: "tr_TR")
  f.maximumFractionDigits = 0
  return f.string(from: NSNumber(value: Double(kurus) / 100)) ?? "₺\(kurus / 100)"
}
