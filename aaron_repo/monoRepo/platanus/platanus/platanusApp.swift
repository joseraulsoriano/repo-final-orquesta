//
//  platanusApp.swift
//  platanus
//
//  Created by Aaron on 20/06/26.
//

import SwiftUI

#if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
import MWDATCore
#endif

@main
struct platanusApp: App {
    init() {
        #if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
        do {
            try Wearables.configure()
            print("Wearables SDK configured successfully.")
        } catch {
            print("Failed to configure Wearables SDK: \(error)")
        }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    print("[platanusApp] URL recibida: \(url)")
                    #if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
                    Task {
                        do {
                            _ = try await Wearables.shared.handleUrl(url)
                            print("[platanusApp] handleUrl completado con éxito")
                        } catch {
                            print("[platanusApp] Error al procesar URL callback: \(error)")
                        }
                    }
                    #endif
                }
        }
    }
}
