import SwiftUI

struct ComposeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var documentID: String?
    @State private var channel = Channel.fax
    @State private var recipient = ""
    @State private var selectedDocument = ""
    @State private var selectedSender = ""
    @State private var subject = ""
    @State private var message = ""
    @State private var ceiling = "2,00"
    @State private var requestKey = UUID().uuidString
    @State private var working = false
    @State private var error: String?
    @State private var preparedID: String?
    @State private var discard = false
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
            if let preparedID {
                Section {
                    Label("Votre envoi est préparé", systemImage: "checkmark.circle").font(.headline)
                    Text("Il n’a pas été envoyé. Retrouvez le document, le destinataire et la validation dans son suivi.")
                    NavigationLink("Consulter et valider l’envoi") { DispatchDetailView(id: preparedID) }
                    Button("Terminer") { dismiss() }
                }
            } else {
                if let error { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
                if channels.isEmpty {
                    Section {
                        ContentUnavailableView("Préparation indisponible", systemImage: "paperplane", description: Text("Aucun mode d’envoi n’est actuellement disponible pour ce compte. Vous pouvez toujours consulter vos documents et votre suivi."))
                        Button("Actualiser les disponibilités") { Task { await model.refresh() } }
                    }
                } else {
                    Section("Envoi") {
                        Picker("Mode d’envoi", selection: $channel) {
                            ForEach(channels) { Text($0.title).tag($0) }
                        }
                        Picker("Expéditeur", selection: $selectedSender) {
                            Text("Choisir un expéditeur").tag("")
                            ForEach(senders) { Text($0.displayName).tag($0.id) }
                        }
                        if senders.isEmpty { Notice(text: "Aucun expéditeur n’est configuré pour ce mode d’envoi.") }
                    }
                    Section("Destinataire") {
                        TextField(channel == .fax ? "Numéro international (+33…)" : "Adresse e-mail", text: $recipient)
                            .keyboardType(channel == .fax ? .phonePad : .emailAddress)
                            .textContentType(channel == .fax ? .telephoneNumber : .emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .accessibilityIdentifier("recipient")
                        if channel == .fax { Text("France, Luxembourg ou Allemagne, selon les routes disponibles.").font(.footnote).foregroundStyle(.secondary) }
                    }
                    if channel == .fax {
                        Section("PDF original") {
                            Picker("Document", selection: $selectedDocument) {
                                Text("Choisir un PDF vérifié").tag("")
                                ForEach(readyDocuments) { Text($0.name).tag($0.id) }
                            }
                            if readyDocuments.isEmpty { Notice(text: "Importez d’abord un PDF dans Documents, puis attendez la fin de sa vérification.") }
                            if !selectedDocument.isEmpty {
                                NavigationLink("Relire le document") { DocumentDetailView(id: selectedDocument) }
                            }
                        }
                    } else {
                        Section("Message") {
                            TextField("Objet", text: $subject).onChange(of: subject) { _, value in if value.count > 200 { subject = String(value.prefix(200)) } }
                            TextEditor(text: $message).frame(minHeight: 160)
                                .accessibilityLabel("Texte du message")
                                .onChange(of: message) { _, value in if value.utf8.count > 100_000 { message = String(value.prefix(20_000)) } }
                        }
                    }
                    Section {
                        TextField("Plafond en euros", text: $ceiling).keyboardType(.decimalPad)
                            .accessibilityLabel("Coût maximum en euros hors taxes")
                    } header: { Text("Coût maximum · EUR HT") } footer: {
                        Text("Le devis précis sera calculé par Guteneo. Préparer cet envoi n’autorise pas son expédition.")
                    }
                    Section {
                        Button { Task { await prepare() } } label: {
                            HStack {
                                Text("Préparer le devis").fontWeight(.semibold)
                                Spacer()
                                if working { ProgressView() } else { Image(systemName: "arrow.right") }
                            }.padding(.vertical, 6)
                        }.disabled(!valid || working || model.session?.user.role == "viewer")
                            .accessibilityIdentifier("prepareQuote")
                    }
                }
            }
        }
        .paperList().navigationTitle("Préparer un envoi").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) {
            Button("Fermer") { if dirty && preparedID == nil { discard = true } else { dismiss() } }.disabled(working)
        } }
        .interactiveDismissDisabled(working || dirty && preparedID == nil)
        .confirmationDialog("Fermer ce brouillon ?", isPresented: $discard, titleVisibility: .visible) {
            Button("Abandonner le brouillon", role: .destructive) { dismiss() }
        } message: { Text("Les informations non préparées ne seront pas enregistrées.") }
        .onChange(of: signature) { _, _ in requestKey = UUID().uuidString }
        .onChange(of: channel) { _, _ in selectedSender = senders.count == 1 ? senders[0].id : "" }
        .task {
            selectedDocument = documentID ?? ""
            if !channels.contains(channel), let first = channels.first { channel = first }
            if senders.count == 1 { selectedSender = senders[0].id }
        }
    }
    private func prepare() async {
        guard let ceilingMinor, valid else { return }
        working = true; error = nil
        defer { working = false }
        var draft = DispatchDraft(channel: channel,
                                  recipient: [channel == .fax ? "phone" : "email": channel == .fax ? recipient.filter { !" ()-".contains($0) } : recipient.trimmingCharacters(in: .whitespacesAndNewlines)],
                                  documentId: channel == .fax ? selectedDocument : nil,
                                  senderId: selectedSender,
                                  subject: channel == .email ? subject : nil,
                                  text: channel == .email ? message : nil,
                                  ceilingMinor: ceilingMinor)
        draft.idempotencyKey = requestKey
        do { preparedID = try await model.prepareDispatch(draft).id }
        catch is CancellationError { }
        catch { self.error = APIError.safeMessage(for: error) }
    }
}
