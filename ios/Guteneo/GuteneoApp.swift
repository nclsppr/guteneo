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
                        let arguments = ProcessInfo.processInfo.arguments
                        let index = arguments.firstIndex(of: "--uitesting-draft-storage")
                        let draftStorageID = index.flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
                        model.activatePreview(draftStorageID: draftStorageID)
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
