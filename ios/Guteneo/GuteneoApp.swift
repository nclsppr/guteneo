import SwiftUI

@main
struct GuteneoApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(\.locale, model.language.locale)
                .tint(Color("Cobalt"))
                .task {
                    #if DEBUG
                    if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--uitesting-language"),
                       ProcessInfo.processInfo.arguments.indices.contains(index + 1),
                       let language = AppLanguage(rawValue: ProcessInfo.processInfo.arguments[index + 1]) {
                        model.chooseWelcomeLanguage(language)
                    }
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
