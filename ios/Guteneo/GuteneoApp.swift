import SwiftUI

@main
struct GuteneoApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Color("Cobalt"))
                .task {
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("--uitesting-preview") {
                        model.activatePreview()
                        return
                    }
                    if ProcessInfo.processInfo.arguments.contains("--uitesting-signed-out") {
                        await model.signOut()
                        return
                    }
                    #endif
                    await model.restoreSession()
                }
        }
    }
}
