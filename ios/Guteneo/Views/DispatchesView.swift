import SwiftUI

struct DispatchesWorkspaceView: View {
    @Binding var composing: Bool
    @State private var selectedDispatchID: String?
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            DispatchesView(composing: $composing, selection: $selectedDispatchID)
                .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 420)
        } detail: {
            NavigationStack {
                if let selectedDispatchID {
                    DispatchDetailView(id: selectedDispatchID)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            Image(systemName: "paperplane")
                                .font(.largeTitle).foregroundStyle(Brand.cobalt)
                                .accessibilityHidden(true)
                            Text("The journey\nof every dispatch.")
                                .font(.system(.largeTitle, design: .serif))
                                .foregroundStyle(Brand.ink)
                            Text("Choose a dispatch to find its recipient, attached document and latest known events.")
                                .font(.title3).foregroundStyle(.secondary)
                            Text("The “Awaiting approval only” filter helps you find preparations waiting for your review.")
                                .foregroundStyle(.secondary)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: 460, alignment: .leading).padding(32)
                        .frame(maxWidth: .infinity)
                    }
                    .background(Brand.paper)
                    .accessibilityIdentifier("dispatches.emptyDetail")
                }
            }
            .id(selectedDispatchID)
        }
        .navigationSplitViewStyle(.balanced)
    }
}

struct DispatchesView: View {
    @Environment(AppModel.self) private var model
    @Binding var composing: Bool
    var selection: Binding<String?>? = nil
    @State private var search = ""
    @State private var needsReview = false
    private var dispatches: [DispatchRecord] {
        model.dispatches.filter {
            (search.isEmpty || $0.recipientLabel.localizedStandardContains(search) || ($0.subject ?? "").localizedStandardContains(search))
            && (!needsReview || $0.canHumanReview)
        }
    }
    var body: some View {
        dispatchList
        .paperList().navigationTitle("Dispatches")
        .accessibilityIdentifier("dispatches.list")
        .searchable(text: $search, prompt: "Recipient or subject")
        .refreshable { await model.refresh() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { composing = true } label: { Label("Prepare a dispatch", systemImage: "plus") }
                    .disabled(model.session?.canPrepare != true)
            }
        }
    }

    @ViewBuilder
    private var dispatchList: some View {
        if let selection {
            List(selection: selection) { listContent }
        } else {
            List { listContent }
        }
    }

    @ViewBuilder
    private var listContent: some View {
        Section { Toggle("Awaiting approval only", isOn: $needsReview) }
        if let error = model.errorMessage { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
        if dispatches.isEmpty && !model.isLoading {
            ContentUnavailableView("No dispatches to display", systemImage: "paperplane", description: Text("Your dispatches will appear here with their latest known status."))
                .listRowBackground(Color.clear)
        }
        ForEach(dispatches) { dispatch in
            Group {
                if selection != nil {
                    NavigationLink(value: dispatch.id) { DispatchRow(dispatch: dispatch) }
                } else {
                    NavigationLink { DispatchDetailView(id: dispatch.id) } label: { DispatchRow(dispatch: dispatch) }
                }
            }
            .accessibilityIdentifier("dispatch.row.\(dispatch.id)")
        }
        if model.hasMoreDispatches {
            Button("Load more dispatches") { Task { await model.loadMoreDispatches() } }
                .disabled(model.isLoading)
        }
    }
}

struct DispatchDetailView: View {
    @Environment(\.locale) private var locale
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
                Section("Your dispatch") {
                    LabeledContent("Channel", value: L10n.text(detail.dispatch.channel.title, locale: locale))
                    LabeledContent("Recipient", value: detail.dispatch.recipientLabel)
                    if let subject = detail.dispatch.subject { LabeledContent("Subject", value: subject) }
                    if let text = detail.dispatch.text, !text.isEmpty { Text(text).textSelection(.enabled) }
                    if let documentID = detail.dispatch.documentId {
                        NavigationLink { DocumentDetailView(id: documentID) } label: { Label("Attached document", systemImage: "doc.text") }
                    }
                }
                Section("Cost limit") {
                    LabeledContent("Limit", value: amount(detail.dispatch.ceilingMinor, currency: detail.dispatch.currency, locale: locale))
                    Notice(text: "This limit is not an amount charged. View the detailed quote and its terms in your secure space.")
                    if let expires = detail.dispatch.quoteExpiresAt { LabeledContent("Quote valid until", value: GuteneoDate.label(expires, locale: locale)) }
                }
                if detail.dispatch.isReviewPreparation {
                    Section("Reference quote") {
                        Notice(text: "This preparation is only for viewing the document and quote. It cannot be approved or sent and does not reserve any amount.", symbol: "doc.text.magnifyingglass")
                        if let url = detail.reviewURL {
                            Button { openReview(url) } label: { Label("View reference quote", systemImage: "safari") }
                        }
                    }
                } else if detail.dispatch.canHumanReview && model.session?.canApprove == true {
                    Section("Your approval") {
                        Notice(text: "Review the content, recipient, options and quote in your secure workspace before confirming sending.", symbol: "checkmark.shield")
                        if let url = detail.reviewURL {
                            Button { openReview(url) } label: { Label("Open secure approval", systemImage: "safari") }
                        }
                    }
                }
                if detail.dispatch.canCancel && model.session?.canApprove == true {
                    Section("Actions") {
                        Button("Cancel this dispatch", role: .destructive) { confirmingCancel = true }
                            .disabled(cancelling || model.session?.canApprove != true)
                    }
                }
                if ["unknown", "submission_unknown"].contains(detail.dispatch.status) {
                    Section {
                        Notice(text: "The provider has not confirmed the outcome. Do not create a second dispatch: refresh tracking or contact support.", symbol: "exclamationmark.triangle")
                        Link("Contact support", destination: Brand.supportURL)
                    }
                }
                Section("History") {
                    if detail.events.isEmpty { Text("No further events.").foregroundStyle(.secondary) }
                    ForEach(detail.events) { event in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(LocalizedStringKey(event.title))
                            Text(GuteneoDate.label(event.createdAt, locale: locale)).font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 4)
                    }
                }
            } else if error == nil { ProgressView("Loading dispatch…") }
            Button("Refresh tracking") { Task { await load() } }
        }.paperList().navigationTitle("Dispatch tracking").navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("dispatch.detail")
            .task { await load() }.refreshable { await load() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { Task { await load() } } }
            .confirmationDialog("Cancel this dispatch?", isPresented: $confirmingCancel, titleVisibility: .visible) {
                Button("Cancel dispatch", role: .destructive) {
                    Task {
                        cancelling = true
                        defer { cancelling = false }
                        do { _ = try await model.cancelDispatch(id: id); await load() }
                        catch { self.error = APIError.safeMessage(for: error) }
                    }
                }
            } message: { Text("A dispatch already accepted cannot be cancelled. The server will check its status.") }
    }
    private func openReview(_ url: URL) {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        components.queryItems = (components.queryItems ?? []).filter { $0.name != "locale" }
            + [URLQueryItem(name: "locale", value: model.language.rawValue)]
        if let localizedURL = components.url { openURL(localizedURL) }
    }
    private func load() async {
        do { detail = try await model.dispatchDetail(id: id); error = nil }
        catch is CancellationError { }
        catch { self.error = APIError.safeMessage(for: error) }
    }
}
