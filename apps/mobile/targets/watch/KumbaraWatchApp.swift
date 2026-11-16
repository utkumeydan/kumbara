import SwiftUI

@main
struct KumbaraWatchApp: App {
  @StateObject private var store = WatchStore()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(store)
    }
  }
}
