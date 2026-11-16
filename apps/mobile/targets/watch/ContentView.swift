import SwiftUI

private let coral = Color(red: 1.0, green: 0.42, blue: 0.34)

struct ContentView: View {
  @EnvironmentObject var store: WatchStore

  var body: some View {
    Group {
      switch store.phase {
      case .loading:
        ProgressView()
      case .pairing(let code):
        PairingView(code: code)
      case .ready(let summary):
        SummaryView(summary: summary)
      case .failed(let message):
        VStack(spacing: 8) {
          Text("🐢").font(.largeTitle)
          Text(message).font(.footnote).multilineTextAlignment(.center)
          Button("Tekrar dene") { store.start() }
        }
      }
    }
    .onAppear { store.start() }
  }
}

struct PairingView: View {
  let code: String

  var body: some View {
    VStack(spacing: 6) {
      Text("Telefonunda").font(.footnote).foregroundStyle(.secondary)
      Text("Ayarlar › Saati bağla").font(.footnote.bold())
      Text(code)
        .font(.system(size: 30, weight: .heavy, design: .rounded))
        .foregroundStyle(coral)
        .minimumScaleFactor(0.6)
        .accessibilityLabel("Eşleştirme kodu \(code.map(String.init).joined(separator: " "))")
      Text("kodunu yaz").font(.footnote).foregroundStyle(.secondary)
    }
  }
}

struct SummaryView: View {
  @EnvironmentObject var store: WatchStore
  let summary: WatchSummary

  var body: some View {
    List {
      VStack(alignment: .leading, spacing: 2) {
        Text("Maaşa \(summary.daysLeft) gün").font(.caption2).foregroundStyle(.secondary)
        Text(formatTL(summary.left))
          .font(.system(size: 30, weight: .heavy, design: .rounded))
          .foregroundStyle(summary.left < 0 ? .red : .primary)
          .minimumScaleFactor(0.5)
        Text("harcamak için kaldı").font(.caption2).foregroundStyle(.secondary)
        HStack {
          Text("günde \(formatTL(summary.perDay))").font(.footnote.bold()).foregroundStyle(coral)
          Spacer()
          Text("🔥 \(summary.streak)").font(.footnote)
        }
        .padding(.top, 4)
      }
      .listRowBackground(Color.clear)

      Section("Zarflar") {
        ForEach(summary.envelopes) { e in
          HStack {
            Text("\(e.icon) \(e.name)").font(.footnote).lineLimit(1)
            Spacer()
            Text(formatTL(e.remaining)).font(.footnote.bold()).foregroundStyle(e.remaining < 0 ? .red : .primary)
          }
        }
      }

      Button("Yenile") { Task { await store.refresh() } }
      Button("Bağlantıyı kaldır", role: .destructive) { store.unpair() }
    }
    .refreshable { await store.refresh() }
  }
}
