import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            switch model.phase {
            case .restoring:
                ProgressView("Ouverture de votre atelier…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity).background(Brand.paper)
            case .signedOut, .expired: WelcomeView()
            case .authenticated: WorkspaceView()
            }
        }
        .privacyShield()
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, model.phase == .authenticated {
                Task { await model.refresh() }
            }
        }
    }
}

private enum WorkspaceTab { case atelier, documents, dispatches, account }

struct WorkspaceView: View {
    @Environment(AppModel.self) private var model
    @State private var tab = WorkspaceTab.atelier
    @State private var composing = false
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                OverviewView(composing: $composing, openDocuments: { tab = .documents })
            }.tabItem { Label("Atelier", systemImage: "square.grid.2x2") }.tag(WorkspaceTab.atelier)
            DocumentsWorkspaceView()
                .tabItem { Label("Documents", systemImage: "doc.on.doc") }.tag(WorkspaceTab.documents)
            DispatchesWorkspaceView(composing: $composing)
                .tabItem { Label("Envois", systemImage: "paperplane") }.tag(WorkspaceTab.dispatches)
            NavigationStack { AccountView() }
                .tabItem { Label("Compte", systemImage: "person.crop.circle") }.tag(WorkspaceTab.account)
        }
        .sheet(isPresented: $composing) { NavigationStack { ComposeView() }.privacyShield() }
    }
}
