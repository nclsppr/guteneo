import SwiftUI

struct DispatchesView: View {
    @Environment(AppModel.self) private var model
    @Binding var composing: Bool
    @State private var search = ""
    @State private var needsReview = false
    private var dispatches: [DispatchRecord] {
        model.dispatches.filter {
            (search.isEmpty || $0.recipientLabel.localizedStandardContains(search) || ($0.subject ?? "").localizedStandardContains(search))
            && (!needsReview || $0.canHumanReview)
        }
    }
    var body: some View {
        List {
            Section { Toggle("À valider uniquement", isOn: $needsReview) }
            if let error = model.errorMessage { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
            if dispatches.isEmpty && !model.isLoading {
                ContentUnavailableView("Aucun envoi à afficher", systemImage: "paperplane", description: Text("Vos envois apparaîtront ici avec leur dernier état connu."))
                    .listRowBackground(Color.clear)
            }
            ForEach(dispatches) { dispatch in
                NavigationLink { DispatchDetailView(id: dispatch.id) } label: { DispatchRow(dispatch: dispatch) }
            }
            if model.hasMoreDispatches {
                Button("Charger les envois suivants") { Task { await model.loadMoreDispatches() } }
                    .disabled(model.isLoading)
            }
        }
        .paperList().navigationTitle("Envois")
        .searchable(text: $search, prompt: "Destinataire ou objet")
        .refreshable { await model.refresh() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { composing = true } label: { Label("Préparer un envoi", systemImage: "plus") }
                    .disabled(model.session?.user.role == "viewer")
            }
        }
    }
}

struct DispatchDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    let id: String
    @State private var detail: DispatchDetail?
    @State private var error: String?
    @State private var cancelling = false
    @State private var confirmingCancel = false
    var body: some View {
        List {
            if let error { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
            if let detail {
                Section { DispatchRow(dispatch: detail.dispatch) }
                Section("Votre envoi") {
                    LabeledContent("Canal", value: detail.dispatch.channel.title)
                    LabeledContent("Destinataire", value: detail.dispatch.recipientLabel)
                    if let subject = detail.dispatch.subject { LabeledContent("Objet", value: subject) }
                    if let text = detail.dispatch.text, !text.isEmpty { Text(text).textSelection(.enabled) }
                    if let documentID = detail.dispatch.documentId {
                        NavigationLink { DocumentDetailView(id: documentID) } label: { Label("Document joint", systemImage: "doc.text") }
                    }
                }
                Section("Limite de coût") {
                    LabeledContent("Plafond", value: amount(detail.dispatch.ceilingMinor, currency: detail.dispatch.currency))
                    Notice(text: "Ce plafond n’est pas un montant débité. Consultez le devis détaillé et ses conditions dans votre espace sécurisé.")
                    if let expires = detail.dispatch.quoteExpiresAt { LabeledContent("Devis valable jusqu’au", value: GuteneoDate.label(expires)) }
                }
                if detail.dispatch.isReviewPreparation {
                    Section("Devis de référence") {
                        Notice(text: "Cette préparation sert uniquement à consulter le document et le devis. Elle ne peut être ni approuvée ni envoyée et ne réserve aucun montant.", symbol: "doc.text.magnifyingglass")
                        if let url = detail.reviewURL {
                            Button { openURL(url) } label: { Label("Consulter le devis de référence", systemImage: "safari") }
                        }
                    }
                } else if detail.dispatch.canHumanReview {
                    Section("Votre validation") {
                        Notice(text: "Vérifiez le contenu, le destinataire, les options et le devis dans l’espace sécurisé avant de confirmer l’envoi.", symbol: "checkmark.shield")
                        if let url = detail.reviewURL {
                            Button { openURL(url) } label: { Label("Ouvrir la validation sécurisée", systemImage: "safari") }
                        }
                    }
                }
                if detail.dispatch.canCancel {
                    Section("Actions") {
                        Button("Annuler cet envoi", role: .destructive) { confirmingCancel = true }
                            .disabled(cancelling || model.session?.user.role == "viewer")
                    }
                }
                if ["unknown", "submission_unknown"].contains(detail.dispatch.status) {
                    Section {
                        Notice(text: "Le fournisseur n’a pas confirmé le résultat. Ne créez pas un second envoi : actualisez le suivi ou contactez l’assistance.", symbol: "exclamationmark.triangle")
                        Link("Contacter l’assistance", destination: Brand.supportURL)
                    }
                }
                Section("Historique") {
                    if detail.events.isEmpty { Text("Aucun événement supplémentaire.").foregroundStyle(.secondary) }
                    ForEach(detail.events) { event in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(event.title)
                            Text(GuteneoDate.label(event.createdAt)).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                }
            } else if error == nil { ProgressView("Chargement de l’envoi…") }
            Button("Actualiser le suivi") { Task { await load() } }
        }.paperList().navigationTitle("Suivi de l’envoi").navigationBarTitleDisplayMode(.inline)
            .task { await load() }.refreshable { await load() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await load() } } }
            .confirmationDialog("Annuler cet envoi ?", isPresented: $confirmingCancel, titleVisibility: .visible) {
                Button("Annuler l’envoi", role: .destructive) {
                    Task {
                        cancelling = true
                        defer { cancelling = false }
                        do { _ = try await model.cancelDispatch(id: id); await load() }
                        catch { self.error = APIError.safeMessage(for: error) }
                    }
                }
            } message: { Text("Un envoi déjà pris en charge ne peut plus être annulé. Le serveur vérifiera son état.") }
    }
    private func load() async {
        do { detail = try await model.dispatchDetail(id: id); error = nil }
        catch is CancellationError { }
        catch { self.error = APIError.safeMessage(for: error) }
    }
}
