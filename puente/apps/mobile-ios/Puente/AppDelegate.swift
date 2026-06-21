import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    static var pendingLaunchURL: URL?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        if let url = launchOptions?[.url] as? URL {
            Self.pendingLaunchURL = url
        }
        return true
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        Self.pendingLaunchURL = url
        NotificationCenter.default.post(name: .puenteDeepLink, object: url)
        return true
    }
}

extension Notification.Name {
    static let puenteDeepLink = Notification.Name("puenteDeepLink")
}
