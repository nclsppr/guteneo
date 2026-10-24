import SwiftUI
import PDFKit
import UniformTypeIdentifiers

struct DocumentsWorkspaceView: View {
    @State private var selectedDocumentID: String?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            DocumentsView(selection: $selectedDocumentID)
                .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 420)
        } detail: {
            NavigationStack {
                if let selectedDocumentID {
                    DocumentDetailView(id: selectedDocumentID)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            Image(systemName: "doc.text.magnifyingglass")
                                .font(.largeTitle).foregroundStyle(Brand.cobalt)
                                .accessibilityHidden(true)
                            Text("Every original,\nin its place.")
                                .font(.system(.largeTitle, design: .serif))
                                .foregroundStyle(Brand.ink)
                            Text("Choose a document from the list to check its verification, read the original PDF or prepare a fax.")
                                .font(.title3).foregroundStyle(.secondary)
                            Text("To add a document, use “Import a PDF” in the list.")
                                .foregroundStyle(.secondary)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: 460, alignment: .leading).padding(32)
                        .frame(maxWidth: .infinity)
                    }
                    .background(Brand.paper)
                    .accessibilityIdentifier("documents.emptyDetail")
                }
            }
            // A new selection owns new loading and presentation state. A row
            // absent from a refreshed page is not proof that it was deleted.
            .id(selectedDocumentID)
        }
        .navigationSplitViewStyle(.balanced)
    }
}

struct DocumentsView: View {
    @Environment(AppModel.self) private var model
    var selection: Binding<String?>? = nil
    @State private var search = ""
    @State private var importing = false
    @State private var uploading = false
    @State private var importedDocumentID: String?
    @State private var error: String?
    private var documents: [DocumentRecord] {
        model.documents.filter { search.isEmpty || $0.name.localizedStandardContains(search) }
    }
    var body: some View {
        documentList
        .paperList().navigationTitle("Documents")
        .accessibilityIdentifier("documents.list")
        .searchable(text: $search, prompt: "Search documents")
        .refreshable { await model.refresh() }
        .sensoryFeedback(.success, trigger: importedDocumentID)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { importing = true } label: { Label("Import PDF", systemImage: "plus") }
                    .disabled(uploading || model.session?.canPrepare != true)
                    .accessibilityIdentifier("importPDF")
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf]) { result in
            switch result {
            case .success(let url):
                uploading = true; error = nil
                Task {
                    defer { uploading = false }
                    do {
                        let document = try await model.uploadPDF(at: url)
                        importedDocumentID = document.id
                        selection?.wrappedValue = document.id
                    }
                    catch is CancellationError { }
                    catch { self.error = APIError.safeMessage(for: error) }
                }
            case .failure:
                error = "The file could not be opened. Select the PDF again in Files."
            }
        }
    }

    @ViewBuilder
    private var documentList: some View {
        if let selection {
            List(selection: selection) { listContent }
        } else {
            List { listContent }
        }
    }

    @ViewBuilder
    private var listContent: some View {
        if let error = error ?? model.errorMessage {
            Section { Notice(text: error, symbol: "exclamationmark.circle") }
        }
        if uploading { Section { ProgressView("Uploading PDF…") } }
        if documents.isEmpty && !model.isLoading {
            ContentUnavailableView(LocalizedStringKey(search.isEmpty ? "Your PDFs, here" : "No documents found"), systemImage: "doc.text", description: Text(LocalizedStringKey(search.isEmpty ? "Import a PDF from Files. Its original will be preserved and verified before use." : "Try another name or load more documents.")))
                .listRowBackground(Color.clear)
        }
        ForEach(documents) { document in
            Group {
                if selection != nil {
                    NavigationLink(value: document.id) { DocumentRow(document: document) }
                } else {
                    NavigationLink { DocumentDetailView(id: document.id) } label: { DocumentRow(document: document) }
                }
            }
            .accessibilityIdentifier("document.row.\(document.id)")
        }
        if model.hasMoreDocuments {
            Button("Load more documents") { Task { await model.loadMoreDocuments() } }
                .disabled(model.isLoading)
        }
        Section {
            Notice(text: "PDFs remain private to your organisation. Verification may take a few minutes.", symbol: "lock.doc")
        }
    }
}

struct DocumentDetailView: View {
    @Environment(\.locale) private var locale
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
                    LabeledContent("Imported on", value: GuteneoDate.label(document.createdAt, locale: locale))
                }
                Section("Verification") {
                    if let analysis = document.analysis {
                        Text(LocalizedStringKey(analysis.safeTitle)).font(.headline)
                        Text(LocalizedStringKey(analysis.safeMessage)).foregroundStyle(.secondary)
                    } else { Text(LocalizedStringKey(document.statusTitle)) }
                    if document.canRescan {
                        Button("Retry verification") {
                            Task {
                                working = true
                                defer { working = false }
                                do { _ = try await model.rescanDocument(id: id); await load() }
                                catch { self.error = APIError.safeMessage(for: error) }
                            }
                        }.disabled(working || model.session?.canPrepare != true)
                    }
                }
                if document.isReady {
                    Section {
                        Button { reading = true } label: { Label("Read original PDF", systemImage: "doc.text.magnifyingglass") }
                        Button { composing = true } label: { Label("Prepare a fax", systemImage: "printer") }
                            .disabled(model.session?.canPrepare != true)
                    }
                }
                Section("Original preserved") {
                    Text("The document sent matches the imported PDF. Guteneo does not modify its pages.")
                        .font(.footnote).foregroundStyle(.secondary)
                    DisclosureGroup("Document fingerprint") {
                        Text(document.sha256).font(.caption.monospaced()).textSelection(.enabled)
                            .accessibilityLabel("SHA 256 fingerprint: \(document.sha256)")
                    }
                }
            } else if error == nil { ProgressView("Opening document…") }
            Button("Refresh") { Task { await load() } }.disabled(working)
        }.paperList().navigationTitle("Document").navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("document.detail")
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
                    Label("PDF unavailable", systemImage: "doc.badge.ellipsis")
                } description: { Text(LocalizedStringKey(error)) } actions: {
                    Button("Try again") { Task { await load() } }
                }
            } else { ProgressView("Opening PDF…") }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity).background(Brand.paper)
        .navigationTitle(name).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } } }
        .task { await load() }
        .onDisappear { data = nil }
    }
    private func load() async {
        error = nil
        do {
            let bytes = try await model.documentContent(id: id)
            try Task.checkCancellation()
            guard PDFDocument(data: bytes) != nil else {
                error = "This PDF cannot be read. Try again or contact support."
                return
            }
            data = bytes
        } catch is CancellationError { }
        catch { self.error = APIError.safeMessage(for: error) }
    }
}

struct NativePDF: UIViewRepresentable {
    @Environment(\.locale) private var locale
    let data: Data
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = .secondarySystemBackground
        view.document = PDFDocument(data: data)
        view.accessibilityIdentifier = "nativePDF"
        view.accessibilityLabel = L10n.text("Original PDF. Scroll to read every page.", locale: locale)
        return view
    }
    func updateUIView(_ view: PDFView, context: Context) {
        view.accessibilityLabel = L10n.text("Original PDF. Scroll to read every page.", locale: locale)
    }
}
