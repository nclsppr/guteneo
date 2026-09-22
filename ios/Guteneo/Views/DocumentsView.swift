import SwiftUI
import PDFKit
import UniformTypeIdentifiers

struct DocumentsView: View {
    @Environment(AppModel.self) private var model
    @State private var search = ""
    @State private var importing = false
    @State private var uploading = false
    @State private var error: String?
    private var documents: [DocumentRecord] {
        model.documents.filter { search.isEmpty || $0.name.localizedStandardContains(search) }
    }
    var body: some View {
        List {
            if let error = error ?? model.errorMessage {
                Section { Notice(text: error, symbol: "exclamationmark.circle") }
            }
            if uploading { Section { ProgressView("Dépôt du PDF…") } }
            if documents.isEmpty && !model.isLoading {
                ContentUnavailableView(search.isEmpty ? "Vos PDF, ici" : "Aucun document trouvé", systemImage: "doc.text", description: Text(search.isEmpty ? "Importez un PDF depuis Fichiers. Son original sera conservé et vérifié avant utilisation." : "Essayez un autre nom ou chargez les documents suivants."))
                    .listRowBackground(Color.clear)
            }
            ForEach(documents) { document in
                NavigationLink { DocumentDetailView(id: document.id) } label: { DocumentRow(document: document) }
            }
            if model.hasMoreDocuments {
                Button("Charger les documents suivants") { Task { await model.loadMoreDocuments() } }
                    .disabled(model.isLoading)
            }
            Section {
                Notice(text: "Les PDF restent privés à votre organisation. Leur vérification peut prendre quelques minutes.", symbol: "lock.doc")
            }
        }
        .paperList().navigationTitle("Documents")
        .searchable(text: $search, prompt: "Rechercher un document")
        .refreshable { await model.refresh() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { importing = true } label: { Label("Importer un PDF", systemImage: "plus") }
                    .disabled(uploading || model.session?.user.role == "viewer")
                    .accessibilityIdentifier("importPDF")
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf]) { result in
            switch result {
            case .success(let url):
                uploading = true; error = nil
                Task {
                    defer { uploading = false }
                    do { _ = try await model.uploadPDF(at: url) }
                    catch is CancellationError { }
                    catch { self.error = APIError.safeMessage(for: error) }
                }
            case .failure:
                error = "Le fichier n’a pas pu être ouvert. Choisissez de nouveau le PDF dans Fichiers."
            }
        }
    }
}

struct DocumentDetailView: View {
    @Environment(AppModel.self) private var model
    let id: String
    @State private var document: DocumentRecord?
    @State private var error: String?
    @State private var working = false
    @State private var reading = false
    @State private var composing = false
    var body: some View {
        List {
            if let error { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
            if let document {
                Section {
                    DocumentRow(document: document)
                    LabeledContent("Importé le", value: GuteneoDate.label(document.createdAt))
                }
                Section("Vérification") {
                    if let analysis = document.analysis {
                        Text(analysis.safeTitle).font(.headline)
                        Text(analysis.safeMessage).foregroundStyle(.secondary)
                    } else { Text(document.statusTitle) }
                    if document.canRescan {
                        Button("Relancer la vérification") {
                            Task {
                                working = true
                                defer { working = false }
                                do { _ = try await model.rescanDocument(id: id); await load() }
                                catch { self.error = APIError.safeMessage(for: error) }
                            }
                        }.disabled(working || model.session?.user.role == "viewer")
                    }
                }
                if document.isReady {
                    Section {
                        Button { reading = true } label: { Label("Lire le PDF original", systemImage: "doc.text.magnifyingglass") }
                        Button { composing = true } label: { Label("Préparer un fax", systemImage: "printer") }
                            .disabled(model.session?.user.role == "viewer")
                    }
                }
                Section("Original conservé") {
                    Text("Le document envoyé correspond au PDF importé. Guteneo ne modifie pas ses pages.")
                        .font(.footnote).foregroundStyle(.secondary)
                    DisclosureGroup("Empreinte du document") {
                        Text(document.sha256).font(.caption.monospaced()).textSelection(.enabled)
                            .accessibilityLabel("Empreinte SHA 256 : \(document.sha256)")
                    }
                }
            } else if error == nil { ProgressView("Ouverture du document…") }
            Button("Actualiser") { Task { await load() } }.disabled(working)
        }.paperList().navigationTitle("Document").navigationBarTitleDisplayMode(.inline)
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $reading) { NavigationStack { PDFReaderView(id: id, name: document?.name ?? "Document") }.privacyShield() }
            .sheet(isPresented: $composing) { NavigationStack { ComposeView(documentID: id) }.privacyShield() }
    }
    private func load() async {
        do { document = try await model.document(id: id); error = nil }
        catch is CancellationError { }
        catch { self.error = APIError.safeMessage(for: error) }
    }
}

struct PDFReaderView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let id: String
    let name: String
    @State private var data: Data?
    @State private var error: String?
    var body: some View {
        Group {
            if let data { NativePDF(data: data) }
            else if let error {
                ContentUnavailableView {
                    Label("PDF indisponible", systemImage: "doc.badge.ellipsis")
                } description: { Text(error) } actions: {
                    Button("Réessayer") { Task { await load() } }
                }
            } else { ProgressView("Ouverture du PDF…") }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity).background(Brand.paper)
        .navigationTitle(name).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fermer") { dismiss() } } }
        .task { await load() }
        .onDisappear { data = nil }
    }
    private func load() async {
        error = nil
        do {
            let bytes = try await model.documentContent(id: id)
            try Task.checkCancellation()
            guard PDFDocument(data: bytes) != nil else {
                error = "Ce PDF ne peut pas être lu. Réessayez ou contactez l’assistance."
                return
            }
            data = bytes
        } catch is CancellationError { }
        catch { self.error = APIError.safeMessage(for: error) }
    }
}

struct NativePDF: UIViewRepresentable {
    let data: Data
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .secondarySystemBackground
        view.document = PDFDocument(data: data)
        view.accessibilityIdentifier = "nativePDF"
        view.accessibilityLabel = "PDF original. Faites défiler pour lire toutes les pages."
        return view
    }
    func updateUIView(_ view: PDFView, context: Context) { }
}
