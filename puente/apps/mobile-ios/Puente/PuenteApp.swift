import SwiftUI

@main
struct PuenteApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var vm = PuenteViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(vm)
                .onOpenURL { url in
                    vm.handleURL(url)
                }
                .onReceive(NotificationCenter.default.publisher(for: .puenteDeepLink)) { note in
                    if let url = note.object as? URL { vm.handleURL(url) }
                }
                .task {
                    vm.boot(initialURL: AppDelegate.pendingLaunchURL)
                    AppDelegate.pendingLaunchURL = nil
                }
        }
    }
}
