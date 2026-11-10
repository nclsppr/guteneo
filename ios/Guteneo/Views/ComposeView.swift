import SwiftUI

struct ComposeView: View {
    @Environment(\.locale) private var locale
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    var documentID: String?
    @State private var fields = DispatchDraftFields()
    @State private var preparation = DispatchPreparationState()
    @State private var error: String?
    @State private var discard = false
    @State private var owner: DispatchDraftOwner?
    @State private var revision: UUID?
    @State private var offeredDraft: SavedDispatchDraft?
    @State private var loaded = false
    @State private var storageReady = false
    @State private var storageError: String?
    @State private var lastSavedFields: DispatchDraftFields?
    @State private var lastSavedPreparation: DispatchPreparationSnapshot?
    private var channels: [Channel] { model.capabilities?.preparableChannels ?? [] }
    private var senders: [SenderRecord] { model.senders.filter { $0.channel == fields.channel && $0.status == "verified" } }
    private var readyDocuments: [DocumentRecord] { model.documents.filter(\.isReady) }
    private var selectedChannel: Binding<Channel> {
        Binding(get: { fields.channel }, set: { value in
            fields.channel = value
            let available = model.senders.filter { $0.channel == value && $0.status == "verified" }
            fields.selectedSender = available.count == 1 ? available[0].id : ""
        })
    }
    private var dirty: Bool { fields.hasContent }
    private var ceilingMinor: Int? {
        let value = fields.ceiling.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard value.range(of: "^[0-9]{1,5}(\\.[0-9]{1,2})?$", options: .regularExpression) != nil,
              let decimal = Decimal(string: value, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        let minor = NSDecimalNumber(decimal: decimal * 100).intValue
        return minor > 0 && minor <= 100_000 ? minor : nil
    }
    private var valid: Bool {
        guard channels.contains(fields.channel), ceilingMinor != nil, !fields.selectedSender.isEmpty else { return false }
        if fields.channel == .fax {
            let phone = fields.recipient.filter { !" ()-".contains($0) }
            return !fields.selectedDocument.isEmpty && phone.range(of: "^\\+(33|352|49)[0-9]{6,12}$", options: .regularExpression) != nil
        }
        return fields.recipient.contains("@") && !fields.recipient.contains(where: \.isWhitespace)
            && !fields.subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !fields.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    var body: some View {
        Form {
            if let storageError { Section {
                Notice(text: storageError, symbol: "lock.trianglebadge.exclamationmark")
                if storageReady { Button("Close without saving") { dismiss() } }
            } }
            if !loaded {
                ProgressView("Opening your workspace…")
            } else if !storageReady {
                Button("Retry draft storage") { initialize() }
            } else if offeredDraft != nil {
                Section {
                    Button("Resume draft") { resumeDraft() }.accessibilityIdentifier("resumeDraft")
                    Button("Discard saved draft", role: .destructive) { discard = true }.accessibilityIdentifier("discardSavedDraft")
                } header: { Text("Saved draft") }
                footer: { Text("Drafts stay on this device for seven days. Resuming does not send anything.") }
            } else if let preparedID = preparation.preparedID {
                Section {
                    Label("Your dispatch is prepared", systemImage: "checkmark.circle").font(.headline)
                    Text("It has not been sent. Find the document, recipient and quote terms in its tracking view.")
                    NavigationLink("View quote") { DispatchDetailView(id: preparedID) }
                    Button("Done") { saveAndClose() }
                    if revision != nil { Button("Discard saved draft", role: .destructive) { discard = true } }
                }
            } else {
                if let error { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
                if preparation.requiresRecovery {
                    Section {
                        Notice(text: "Preparation was interrupted. Recover the same quote before editing this draft.")
                        Button("Recover quote") { Task { await prepare() } }
                            .disabled(model.session?.canPrepare != true)
                            .accessibilityIdentifier("recoverDraftQuote")
                    }
                }
                if channels.isEmpty {
                    Section {
                        ContentUnavailableView("Preparation unavailable", systemImage: "paperplane", description: Text("No delivery method is currently available for this account. You can still view your documents and tracking."))
                        Button("Refresh availability") { Task { await model.refresh() } }
                    }
                } else {
                    Section("Dispatch") {
                        Picker("Delivery method", selection: selectedChannel) {
                            ForEach(channels) { Text(LocalizedStringKey($0.title)).tag($0) }
                        }
                        Picker("Sender", selection: $fields.selectedSender) {
                            Text("Choose a sender").tag("")
                            ForEach(senders) { Text($0.name ?? $0.address ?? L10n.text($0.channel.title, locale: locale)).tag($0.id) }
                        }
                        if senders.isEmpty { Notice(text: "No sender is configured for this delivery method.") }
                    }.disabled(!preparation.canEdit)
                    Section("Recipient") {
                        TextField(LocalizedStringKey(fields.channel == .fax ? "International number (+33…)" : "Email address"), text: $fields.recipient)
                            .keyboardType(fields.channel == .fax ? .phonePad : .emailAddress)
                            .textContentType(fields.channel == .fax ? .telephoneNumber : .emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .accessibilityIdentifier("recipient")
                        if fields.channel == .fax { Text("France, Luxembourg or Germany, depending on available routes.").font(.footnote).foregroundStyle(.secondary) }
                    }.disabled(!preparation.canEdit)
                    if fields.channel == .fax {
                        Section("Original PDF") {
                            Picker("Document", selection: $fields.selectedDocument) {
                                Text("Choose a verified PDF").tag("")
                                ForEach(readyDocuments) { Text($0.name).tag($0.id) }
                            }
                            if readyDocuments.isEmpty { Notice(text: "First import a PDF in Documents, then wait for verification to finish.") }
                            if !fields.selectedDocument.isEmpty {
                                NavigationLink("Review document") { DocumentDetailView(id: fields.selectedDocument) }
                            }
                        }.disabled(!preparation.canEdit)
                    } else {
                        Section("Message") {
                            TextField("Subject", text: $fields.subject).onChange(of: fields.subject) { _, value in if value.count > 200 { fields.subject = String(value.prefix(200)) } }
                            TextEditor(text: $fields.message).frame(minHeight: 160)
                                .accessibilityLabel("Message text")
                                .onChange(of: fields.message) { _, value in if value.utf8.count > 100_000 { fields.message = String(value.prefix(20_000)) } }
                        }.disabled(!preparation.canEdit)
                    }
                    Section {
                        TextField("Limit in euros", text: $fields.ceiling).keyboardType(.decimalPad)
                            .accessibilityLabel("Maximum cost in euros excluding tax")
                    } header: { Text("Maximum cost · EUR excl. tax") } footer: {
                        Text("Guteneo will calculate the exact quote. Preparing this dispatch does not authorise sending it.")
                    }.disabled(!preparation.canEdit)
                    if !preparation.requiresRecovery { Section {
                        Button { Task { await prepare() } } label: {
                            HStack {
                                Text("Prepare quote").fontWeight(.semibold)
                                Spacer()
                                if preparation.isPreparing { ProgressView() } else { Image(systemName: "arrow.right") }
                            }.padding(.vertical, 6)
                        }.disabled(!valid || preparation.isPreparing || model.session?.canPrepare != true)
                            .accessibilityIdentifier("prepareQuote")
                    } }
                }
                if owner != nil {
                    Section {
                        Button("Save draft and close") { saveAndClose() }.accessibilityIdentifier("saveDraft")
                        if dirty || revision != nil { Button("Discard saved draft", role: .destructive) { discard = true } }
                    } footer: { Text("Drafts stay on this device for seven days. Resuming does not send anything.") }
                }
            }
        }
        .disabled(preparation.isPreparing)
        .paperList().navigationTitle("Prepare a dispatch").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) {
            Button("Close") { saveAndClose() }.disabled(preparation.isPreparing)
        } }
        .interactiveDismissDisabled(preparation.isPreparing || dirty && preparation.preparedID == nil)
        .confirmationDialog("Discard saved draft?", isPresented: $discard, titleVisibility: .visible) {
            Button("Discard draft", role: .destructive) { discardDraft() }.accessibilityIdentifier("confirmDiscardDraft")
        } message: { Text("This removes the saved draft from this device. A prepared dispatch remains in tracking.") }
        .onChange(of: fields) { _, _ in
            guard loaded, storageReady, offeredDraft == nil, preparation.canEdit, fields != lastSavedFields else { return }
            preparation.draftChanged()
            _ = saveDraft()
        }
        .onChange(of: model.dispatchDraftOwner) { _, next in
            guard next != owner, !model.isPreview else { return }
            loaded = false; fields = DispatchDraftFields(); offeredDraft = nil
            preparation = DispatchPreparationState(); owner = nil; dismiss()
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active, offeredDraft == nil { _ = saveDraft() } }
        .task { if !loaded { initialize() } }
    }

    private func initialize() {
        owner = model.dispatchDraftOwner
        do {
            offeredDraft = try owner.flatMap { try model.savedDispatchDraft(owner: $0) }
            storageReady = true; storageError = nil; loaded = true
            if offeredDraft == nil {
                fields.ceiling = Decimal(2).formatted(.number.precision(.fractionLength(2)).locale(locale))
                fields.selectedDocument = documentID ?? ""
                if !channels.contains(fields.channel), let first = channels.first { fields.channel = first }
                if senders.count == 1 { fields.selectedSender = senders[0].id }
            }
        } catch { loaded = true; storageReady = false; storageError = draftError(error) }
    }

    private func resumeDraft() {
        guard let saved = offeredDraft, saved.owner == model.dispatchDraftOwner else { return }
        lastSavedFields = saved.fields; lastSavedPreparation = saved.preparation
        fields = saved.fields; preparation = DispatchPreparationState(restoring: saved.preparation)
        revision = saved.revision; offeredDraft = nil
    }

    @discardableResult
    private func saveDraft() -> Bool {
        guard loaded, storageReady, offeredDraft == nil else { return false }
        guard let owner else { return model.isPreview }
        guard fields.hasContent || revision != nil || preparation.preparedID != nil else { return true }
        if fields == lastSavedFields, preparation.snapshot == lastSavedPreparation { return true }
        do {
            let saved = try model.saveDispatchDraft(owner: owner, fields: fields, preparation: preparation.snapshot, replacing: revision)
            revision = saved.revision; lastSavedFields = saved.fields; lastSavedPreparation = saved.preparation
            storageError = nil
            return true
        } catch { storageError = draftError(error); return false }
    }

    private func saveAndClose() {
        if !storageReady || offeredDraft != nil || (loaded && saveDraft()) { dismiss() }
    }

    private func discardDraft() {
        guard let owner else { return }
        do {
            if let savedRevision = offeredDraft?.revision ?? revision {
                try model.discardDispatchDraft(owner: owner, revision: savedRevision)
            }
            loaded = false; fields = DispatchDraftFields(); offeredDraft = nil; dismiss()
        } catch { storageError = draftError(error) }
    }

    private func draftError(_ error: Error) -> String {
        (error as? DispatchDraftStorageError)?.message ?? DispatchDraftStorageError.unavailable.message
    }

    private func prepare() async {
        let recovering = preparation.requiresRecovery
        guard model.session?.canPrepare == true, let ceilingMinor, (valid || recovering), let requestKey = preparation.begin() else { return }
        error = nil
        guard saveDraft() else { preparation.finish(requiresRecovery: recovering); return }
        var draft = DispatchDraft(channel: fields.channel,
                                  recipient: [fields.channel == .fax ? "phone" : "email": fields.channel == .fax ? fields.recipient.filter { !" ()-".contains($0) } : fields.recipient.trimmingCharacters(in: .whitespacesAndNewlines)],
                                  documentId: fields.channel == .fax ? fields.selectedDocument : nil,
                                  senderId: fields.selectedSender,
                                  subject: fields.channel == .email ? fields.subject : nil,
                                  text: fields.channel == .email ? fields.message : nil,
                                  ceilingMinor: ceilingMinor)
        draft.idempotencyKey = requestKey
        do { preparation.finish(preparedID: try await model.prepareDispatch(draft).id) }
        catch is CancellationError { preparation.finish(requiresRecovery: true) }
        catch {
            let failure = error as? APIError
            let uncertain = failure == nil || failure?.status == 0 || (failure?.status ?? 0) >= 500 || failure?.status == 409
            preparation.finish(requiresRecovery: uncertain)
            self.error = APIError.safeMessage(for: error)
        }
        _ = saveDraft()
    }
}
