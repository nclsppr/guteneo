import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            switch model.phase {
            case .restoring:
                VStack(spacing: 24) { Wordmark(); ProgressView("Ouverture de votre atelier…") }
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

struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    Wordmark().padding(.bottom, 18)
                    Image("BrandMark").resizable().scaledToFit()
                        .frame(width: 106, height: 106).accessibilityHidden(true)
                    Text("Votre atelier,\nà portée de main.")
                        .font(.system(.largeTitle, design: .serif)).foregroundStyle(Brand.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Retrouvez vos PDF, préparez vos envois et suivez leur parcours.")
                        .font(.title3).foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 18) {
                        Label("Vos documents, sans les modifier", systemImage: "doc.text")
                        Label("Chaque envoi sous votre contrôle", systemImage: "checkmark.shield")
                        Label("Un suivi partagé avec votre atelier", systemImage: "clock.arrow.circlepath")
                    }.font(.body)
                    if let error = model.errorMessage {
                        Notice(text: error, symbol: "exclamationmark.circle")
                    }
                    if model.phase == .expired {
                        Notice(text: "Votre session a expiré. Reconnectez-vous pour retrouver votre atelier.")
                    }
                    Button {
                        Task { await model.signIn() }
                    } label: {
                        HStack {
                            Text("Se connecter").fontWeight(.semibold)
                            Spacer()
                            if model.isWorking { ProgressView() }
                            else { Image(systemName: "arrow.right") }
                        }.padding(.vertical, 9)
                    }
                    .buttonStyle(.borderedProminent).disabled(model.isWorking)
                    .accessibilityIdentifier("signIn")
                    Text("La connexion sécurisée s’ouvre dans le navigateur système.")
                        .font(.footnote).foregroundStyle(.secondary)
                    HStack(spacing: 24) {
                        Link("Confidentialité", destination: Brand.legalURL)
                        Link("Assistance", destination: Brand.supportURL)
                    }.font(.footnote).padding(.vertical, 6)
                }
                .frame(maxWidth: 560, alignment: .leading).padding(28)
                .frame(maxWidth: .infinity)
            }.background(Brand.paper)
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
                OverviewView(composing: $composing)
            }.tabItem { Label("Atelier", systemImage: "square.grid.2x2") }.tag(WorkspaceTab.atelier)
            NavigationStack { DocumentsView() }
                .tabItem { Label("Documents", systemImage: "doc.on.doc") }.tag(WorkspaceTab.documents)
            NavigationStack { DispatchesView(composing: $composing) }
                .tabItem { Label("Envois", systemImage: "paperplane") }.tag(WorkspaceTab.dispatches)
            NavigationStack { AccountView() }
                .tabItem { Label("Compte", systemImage: "person.crop.circle") }.tag(WorkspaceTab.account)
        }
        .sheet(isPresented: $composing) { NavigationStack { ComposeView() }.privacyShield() }
    }
}

struct OverviewView: View {
    @Environment(AppModel.self) private var model
    @Binding var composing: Bool
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 18) {
                    Wordmark()
                    Text("Le bon document.\nLe bon destinataire.")
                        .font(.system(.title, design: .serif))
                    Text(model.session?.organization.name ?? "Votre atelier")
                        .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Button { composing = true } label: {
                        Label("Préparer un envoi", systemImage: "plus").padding(.vertical, 5)
                    }.buttonStyle(.borderedProminent).accessibilityIdentifier("prepareDispatch")
                }.padding(.vertical, 12)
            }.listRowBackground(Color.clear)
            if model.session?.simulation == true {
                Section { Notice(text: "Simulation · aucun envoi réel.", symbol: "testtube.2") }
            }
            if let error = model.errorMessage {
                Section {
                    Notice(text: error, symbol: "exclamationmark.circle")
                    Button("Réessayer") { Task { await model.refresh() } }
                }
            }
            Section("Derniers envois") {
                if model.dispatches.isEmpty {
                    ContentUnavailableView("Aucun envoi pour le moment", systemImage: "paperplane", description: Text("Commencez par importer un PDF ou préparer un message."))
                } else {
                    ForEach(model.dispatches.prefix(5)) { dispatch in
                        NavigationLink { DispatchDetailView(id: dispatch.id) } label: { DispatchRow(dispatch: dispatch) }
                    }
                }
            }
            Section("À retrouver dans l’atelier") {
                NavigationLink { DocumentsView() } label: { Label("Vos documents", systemImage: "doc.on.doc") }
                Notice(text: "Préparez ici. Vérifiez puis validez personnellement chaque envoi dans votre espace sécurisé.", symbol: "checkmark.shield")
            }
        }.paperList().navigationTitle("Atelier")
            .refreshable { await model.refresh() }
            .overlay { if model.isLoading && model.dispatches.isEmpty { ProgressView() } }
    }
}
