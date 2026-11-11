import SwiftUI

struct ComposeView: View {
    @Environment(\.locale) private var locale
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var documentID: String?
    @State private var channel = Channel.fax
    @State private var recipient = ""
    @State private var selectedDocument = ""
    @State private var selectedSender = ""
    @State private var subject = ""
    @State private var message = ""
    @State private var ceiling = ""
    @State private var preparation = DispatchPreparationState()
    @State private var error: String?
    @State private var discard = false
    /// The fields as restored from this device; editing them starts a new request.
    @State private var restoredSignature: String?
    @State private var interrupted = false
    private var draftIdentity: String? {
        model.session.map { DraftStore.identity(organization: $0.organization.id, user: $0.user.id) }
    }
    private var storedDraft: StoredDraft {
        StoredDraft(channel: channel.rawValue, recipient: recipient, document: selectedDocument,
                    sender: selectedSender, subject: subject, message: message, ceiling: ceiling,
                    requestKey: preparation.requestKey, preparing: preparation.isPreparing)
    }
    private var channels: [Channel] { model.capabilities?.preparableChannels ?? [] }
    private var senders: [SenderRecord] { model.senders.filter { $0.channel == channel && $0.status == "verified" } }
    private var readyDocuments: [DocumentRecord] { model.documents.filter(\.isReady) }
    private var dirty: Bool { !recipient.isEmpty || !subject.isEmpty || !message.isEmpty }
    private var signature: String { [channel.rawValue, recipient, selectedDocument, selectedSender, subject, message, ceiling].joined(separator: "\u{0}") }
    private var ceilingMinor: Int? {
        let value = ceiling.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard value.range(of: "^[0-9]{1,5}(\\.[0-9]{1,2})?$", options: .regularExpression) != nil,
              let decimal = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        let minor = NSDecimalNumber(decimal: decimal * 100).intValue
        return minor > 0 && minor <= 100_000 ? minor : nil
    }
    private var valid: Bool {
        guard channels.contains(channel), ceilingMinor != nil, !selectedSender.isEmpty else { return false }
        if channel == .fax {
            let phone = recipient.filter { !" ()-".contains($0) }
            return !selectedDocument.isEmpty && phone.range(of: "^\\+(33|352|49)[0-9]{6,12}$", options: .regularExpression) != nil
        }
        return recipient.contains("@") && !recipient.contains(where: \.isWhitespace)
            && !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var body: some View {
        Form {
            if let preparedID = preparation.preparedID {
                Section {
                    Label("Your dispatch is prepared", systemImage: "checkmark.circle").font(.headline)
                    Text("It has not been sent. Find the document, recipient and quote terms in its tracking view.")
                    NavigationLink("View quote") { DispatchDetailView(id: preparedID) }
                    Button("Done") { dismiss() }
                }
            } else {
                if let error { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
                if interrupted {
                    Section { Notice(text: "This draft was being prepared when the app closed. Prepare it again: the same request is reused, so no second dispatch is created.", symbol: "arrow.clockwise") }
                }
                if channels.isEmpty {
                    Section {
                        ContentUnavailableView("Preparation unavailable", systemImage: "paperplane", description: Text("No delivery method is currently available for this account. You can still view your documents and tracking."))
                        Button("Refresh availability") { Task { await model.refresh() } }
                    }
                } else {
                    Section("Dispatch") {
                        Picker("Delivery method", selection: $channel) {
                            ForEach(channels) { Text(LocalizedStringKey($0.title)).tag($0) }
                        }
                        Picker("Sender", selection: $selectedSender) {
                            Text("Choose a sender").tag("")
                            ForEach(senders) { Text($0.name ?? $0.address ?? L10n.text($0.channel.title, locale: locale)).tag($0.id) }
                        }
                        if senders.isEmpty { Notice(text: "No sender is configured for this delivery method.") }
                    }
                    Section("Recipient") {
                        TextField(LocalizedStringKey(channel == .fax ? "International number (+33…)" : "Email address"), text: $recipient)
                            .keyboardType(channel == .fax ? .phonePad : .emailAddress)
                            .textContentType(channel == .fax ? .telephoneNumber : .emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .accessibilityIdentifier("recipient")
                        if channel == .fax { Text("France, Luxembourg or Germany, depending on available routes.").font(.footnote).foregroundStyle(.secondary) }
                    }
                    if channel == .fax {
                        Section("Original PDF") {
                            Picker("Document", selection: $selectedDocument) {
                                Text("Choose a verified PDF").tag("")
                                ForEach(readyDocuments) { Text($0.name).tag($0.id) }
                            }
                            if readyDocuments.isEmpty { Notice(text: "First import a PDF in Documents, then wait for verification to finish.") }
                            if !selectedDocument.isEmpty {
                                NavigationLink("Review document") { DocumentDetailView(id: selectedDocument) }
                            }
                        }
                    } else {
                        Section("Message") {
                            TextField("Subject", text: $subject).onChange(of: subject) { _, value in if value.count > 200 { subject = String(value.prefix(200)) } }
                            TextEditor(text: $message).frame(minHeight: 160)
                                .accessibilityLabel("Message text")
                                .onChange(of: message) { _, value in if value.utf8.count > 100_000 { message = String(value.prefix(20_000)) } }
                        }
                    }
                    Section {
                        TextField("Limit in euros", text: $ceiling).keyboardType(.decimalPad)
                            .accessibilityLabel("Maximum cost in euros excluding tax")
                    } header: { Text("Maximum cost · EUR excl. tax") } footer: {
                        Text("Guteneo will calculate the exact quote. Preparing this dispatch does not authorise sending it.")
                    }
                    Section {
                        Button { Task { await prepare() } } label: {
                            HStack {
                                Text("Prepare quote").fontWeight(.semibold)
                                Spacer()
                                if preparation.isPreparing { ProgressView() } else { Image(systemName: "arrow.right") }
                            }.padding(.vertical, 6)
                        }.disabled(!valid || preparation.isPreparing || model.session?.canPrepare != true)
                            .accessibilityIdentifier("prepareQuote")
                    }
                }
            }
        }
        .disabled(preparation.isPreparing)
        .paperList().navigationTitle("Prepare a dispatch").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) {
            Button("Close") { if dirty && preparation.preparedID == nil { discard = true } else { dismiss() } }.disabled(preparation.isPreparing)
        } }
        // The draft is kept on every change, so closing loses nothing.
        .interactiveDismissDisabled(preparation.isPreparing)
        .confirmationDialog("Close this draft?", isPresented: $discard, titleVisibility: .visible) {
            Button("Keep draft") { dismiss() }
            Button("Discard draft", role: .destructive) {
                if let draftIdentity { DraftStore.device.clear(identity: draftIdentity) }
                dismiss()
            }
        } message: { Text("The draft stays on this device until you prepare or discard it.") }
        .onChange(of: signature) { _, value in
            if value == restoredSignature { restoredSignature = nil; return }
            restoredSignature = nil
            interrupted = false
            preparation.draftChanged()
            if let draftIdentity, preparation.preparedID == nil {
                if dirty { DraftStore.device.save(storedDraft, identity: draftIdentity) }
                else { DraftStore.device.clear(identity: draftIdentity) }
            }
        }
        .onChange(of: channel) { _, _ in
            // Keep a sender that still fits, such as one restored with the draft.
            if !senders.contains(where: { $0.id == selectedSender }) {
                selectedSender = senders.count == 1 ? senders[0].id : ""
            }
        }
        .task {
            if ceiling.isEmpty { ceiling = Decimal(2).formatted(.number.precision(.fractionLength(2)).locale(locale)) }
            selectedDocument = documentID ?? ""
            if !channels.contains(channel), let first = channels.first { channel = first }
            if senders.count == 1 { selectedSender = senders[0].id }
            restoreDraft()
        }
    }
    /// Brings back the draft this identity left on the device, unless the
    /// person opened Prepare from another document.
    private func restoreDraft() {
        guard let draftIdentity, let stored = DraftStore.device.load(identity: draftIdentity),
              documentID == nil || documentID == stored.document,
              let restoredChannel = Channel(rawValue: stored.channel), channels.contains(restoredChannel) else { return }
        channel = restoredChannel
        recipient = stored.recipient
        selectedDocument = stored.document
        selectedSender = stored.sender
        subject = stored.subject
        message = stored.message
        ceiling = stored.ceiling
        preparation = DispatchPreparationState(restoring: stored.requestKey)
        interrupted = stored.preparing
        restoredSignature = signature
    }
    private func prepare() async {
        guard let ceilingMinor, valid, let requestKey = preparation.begin() else { return }
        error = nil
        // Written before the request leaves: if the app closes now, the next
        // attempt reuses this key.
        if let draftIdentity { DraftStore.device.save(storedDraft, identity: draftIdentity) }
        defer {
            preparation.finish()
            if let draftIdentity {
                if preparation.preparedID != nil { DraftStore.device.clear(identity: draftIdentity) }
                else { DraftStore.device.save(storedDraft, identity: draftIdentity) }
            }
        }
        var draft = DispatchDraft(channel: channel,
                                  recipient: [channel == .fax ? "phone" : "email": channel == .fax ? recipient.filter { !" ()-".contains($0) } : recipient.trimmingCharacters(in: .whitespacesAndNewlines)],
                                  documentId: channel == .fax ? selectedDocument : nil,
                                  senderId: selectedSender,
                                  subject: channel == .email ? subject : nil,
                                  text: channel == .email ? message : nil,
                                  ceilingMinor: ceilingMinor)
        draft.idempotencyKey = requestKey
        do { preparation.finish(preparedID: try await model.prepareDispatch(draft).id) }
        catch is CancellationError { }
        catch { self.error = APIError.safeMessage(for: error) }
    }
}
