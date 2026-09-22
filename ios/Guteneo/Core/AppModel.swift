import Foundation
import Observation
#if DEBUG
import UIKit
#endif

enum SessionPhase: Equatable { case restoring, signedOut, authenticated, expired }

@MainActor @Observable
final class AppModel {
    private(set) var phase: SessionPhase = .restoring
    private(set) var session: MobileSession?
    private(set) var documents: [DocumentRecord] = []
    private(set) var dispatches: [DispatchRecord] = []
    private(set) var senders: [SenderRecord] = []
    private(set) var capabilities: MobileCapabilities?
    private(set) var accountDeletionRequest: AccountDeletionRequest?
    private(set) var isLoading = false
    private(set) var isPreview = false
    var errorMessage: String?
    var isWorking: Bool { workingCount > 0 }
    var hasMoreDocuments: Bool { documentCursor != nil }
    var hasMoreDispatches: Bool { dispatchCursor != nil }
    var readyDocuments: [DocumentRecord] { documents.filter(\.isReady) }
    var availableChannels: [Channel] { capabilities?.preparableChannels ?? [] }

    @ObservationIgnored private let client: APIClient
    @ObservationIgnored private let credentials: any CredentialStore
    @ObservationIgnored private let auth: MobileAuthenticator
    private var documentCursor: String?
    private var dispatchCursor: String?
    private var workingCount = 0
    private var sessionGeneration = 0
    private var dataGeneration = 0
    private var loadingMoreDocuments = false
    private var loadingMoreDispatches = false

    init(client: APIClient = .live, credentials: any CredentialStore = KeychainCredentials(), auth: MobileAuthenticator? = nil) {
        self.client = client
        self.credentials = credentials
        self.auth = auth ?? MobileAuthenticator()
    }

    func restoreSession() async {
        guard phase == .restoring else { return }
        let generation = sessionGeneration
        do {
            guard let stored = try credentials.load() else { phase = .signedOut; return }
            guard !stored.hasExpired else { try credentials.delete(); phase = .expired; return }
            await client.setToken(stored.token)
            let current = try await client.session()
            try Task.checkCancellation()
            guard generation == sessionGeneration else { return }
            guard !current.simulation else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
            session = current
            phase = .authenticated
            await refresh()
        } catch is CancellationError {
            // A cancelled view task may restart restoration on its next appearance.
        } catch {
            guard generation == sessionGeneration else { return }
            await handle(error)
            if phase == .restoring { phase = .signedOut }
        }
    }

    func signIn() async {
        guard !isWorking else { return }
        workingCount += 1
        defer { workingCount -= 1 }
        errorMessage = nil
        sessionGeneration += 1
        let generation = sessionGeneration
        do {
            let authorization = try await auth.authenticate()
            let exchange = try await client.exchange(code: authorization.code, verifier: authorization.verifier)
            try Task.checkCancellation()
            guard generation == sessionGeneration else { return }
            guard !exchange.session.simulation else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
            let stored = StoredCredentials(token: exchange.token, expiresAt: exchange.expiresAt)
            guard !stored.hasExpired else { throw APIError(code: "SESSION_EXPIRED", status: 401) }
            try credentials.save(stored)
            await client.setToken(exchange.token)
            session = exchange.session
            phase = .authenticated
            await refresh()
        } catch is CancellationError { }
        catch { await handle(error) }
    }

    func signOut() async {
        workingCount += 1
        defer { workingCount -= 1 }
        auth.cancel()
        sessionGeneration += 1
        clearAccount()
        phase = .signedOut
        var remoteFailure: Error?
        var localFailure: Error?
        if !isPreview {
            // Remove persistence before the first network suspension: terminating
            // the app during a slow remote revocation must not restore this login.
            do { try credentials.delete() } catch { localFailure = error }
            do { try await client.logout() } catch { remoteFailure = error }
        }
        isPreview = false
        await client.setToken(nil)
        if localFailure != nil {
            errorMessage = "Le retrait de la session du stockage sécurisé n’a pas pu être confirmé. Déverrouillez votre appareil avant de relancer l’application."
        } else if let failure = remoteFailure, !(failure is CancellationError), (failure as? APIError)?.isAuthenticationFailure != true {
            errorMessage = "Vous êtes déconnecté sur cet appareil. La révocation distante n’a pas pu être confirmée ; la session expire automatiquement."
        }
    }

    func refresh() async {
        guard phase == .authenticated, !isPreview else { return }
        dataGeneration += 1
        let dataVersion = dataGeneration
        let generation = sessionGeneration
        isLoading = true
        defer { if dataVersion == dataGeneration { isLoading = false } }
        do {
            async let nextDocuments = client.documents()
            async let nextDispatches = client.dispatches()
            async let nextSenders = client.senders()
            async let nextCapabilities = client.capabilities()
            async let nextDeletionRequest = client.accountDeletionRequest()
            let (docPage, dispatchPage, senderList, currentCapabilities, deletion) = try await (nextDocuments, nextDispatches, nextSenders, nextCapabilities, nextDeletionRequest)
            try Task.checkCancellation()
            guard generation == sessionGeneration, dataVersion == dataGeneration else { return }
            guard !currentCapabilities.simulation, currentCapabilities.version == "1" else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
            documents = docPage.items
            dispatches = dispatchPage.items
            senders = senderList
            capabilities = currentCapabilities
            accountDeletionRequest = deletion
            documentCursor = docPage.nextCursor
            dispatchCursor = dispatchPage.nextCursor
            errorMessage = nil
        } catch is CancellationError { }
        catch { if generation == sessionGeneration, dataVersion == dataGeneration { await handle(error) } }
    }

    func loadMoreDocuments() async {
        guard !isPreview, !isLoading, !loadingMoreDocuments, let cursor = documentCursor, phase == .authenticated else { return }
        let generation = sessionGeneration
        let version = dataGeneration
        loadingMoreDocuments = true
        defer { loadingMoreDocuments = false }
        do {
            let page = try await client.documents(cursor: cursor)
            try Task.checkCancellation()
            guard generation == sessionGeneration, version == dataGeneration else { return }
            let known = Set(documents.map(\.id))
            documents += page.items.filter { !known.contains($0.id) }
            documentCursor = page.nextCursor == cursor ? nil : page.nextCursor
        } catch is CancellationError { }
        catch { if generation == sessionGeneration { await handle(error) } }
    }

    func loadMoreDispatches() async {
        guard !isPreview, !isLoading, !loadingMoreDispatches, let cursor = dispatchCursor, phase == .authenticated else { return }
        let generation = sessionGeneration
        let version = dataGeneration
        loadingMoreDispatches = true
        defer { loadingMoreDispatches = false }
        do {
            let page = try await client.dispatches(cursor: cursor)
            try Task.checkCancellation()
            guard generation == sessionGeneration, version == dataGeneration else { return }
            let known = Set(dispatches.map(\.id))
            dispatches += page.items.filter { !known.contains($0.id) }
            dispatchCursor = page.nextCursor == cursor ? nil : page.nextCursor
        } catch is CancellationError { }
        catch { if generation == sessionGeneration { await handle(error) } }
    }

    func document(id: String) async throws -> DocumentRecord {
        if isPreview {
            guard let document = documents.first(where: { $0.id == id }) else { throw APIError(code: "NOT_FOUND") }
            return document
        }
        return try await perform { try await self.client.document(id: id) }
    }
    func documentContent(id: String) async throws -> Data {
        #if DEBUG
        if isPreview { return try PreviewFixtures.documentPDF(id: id) }
        #endif
        return try await perform { try await self.client.documentContent(id: id) }
    }
    func dispatchDetail(id: String) async throws -> DispatchDetail {
        #if DEBUG
        if isPreview { return try PreviewFixtures.detail(id: id) }
        #endif
        return try await perform { try await self.client.dispatchDetail(id: id) }
    }
    func uploadPDF(at url: URL) async throws -> DocumentRecord {
        guard !isPreview else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
        let maximum = capabilities?.limits.pdfBytes ?? APIClient.maximumPDFBytes
        let document = try await perform { try await self.client.uploadPDF(at: url, maximumBytes: maximum) }
        upsert(document)
        return document
    }
    func rescanDocument(id: String) async throws -> DocumentRecord {
        guard !isPreview else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
        let document = try await perform { try await self.client.rescanDocument(id: id) }
        upsert(document)
        return document
    }
    func prepareDispatch(_ draft: DispatchDraft) async throws -> DispatchRecord {
        guard !isPreview else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
        guard availableChannels.contains(draft.channel) else { throw APIError(code: "CHANNEL_NOT_AVAILABLE") }
        let dispatch = try await perform { try await self.client.prepareDispatch(draft) }
        dispatches.removeAll { $0.id == dispatch.id }
        dispatches.insert(dispatch, at: 0)
        return dispatch
    }
    func cancelDispatch(id: String) async throws {
        guard !isPreview else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
        try await perform { try await self.client.cancelDispatch(id: id) }
        await refresh()
    }
    func requestAccountDeletion() async throws -> AccountDeletionRequest {
        guard !isPreview else { throw APIError(code: "SIMULATION_UNAVAILABLE") }
        let result = try await perform { try await self.client.requestAccountDeletion() }
        accountDeletionRequest = result
        return result
    }

    private func upsert(_ document: DocumentRecord) {
        if let index = documents.firstIndex(where: { $0.id == document.id }) { documents[index] = document }
        else { documents.insert(document, at: 0) }
    }
    private func perform<Value>(_ operation: () async throws -> Value) async throws -> Value {
        guard phase == .authenticated else { throw APIError(code: "SESSION_EXPIRED", status: 401) }
        let generation = sessionGeneration
        workingCount += 1
        defer { workingCount -= 1 }
        do {
            let value = try await operation()
            try Task.checkCancellation()
            guard generation == sessionGeneration else { throw CancellationError() }
            return value
        } catch {
            if !(error is CancellationError), generation == sessionGeneration { await handle(error) }
            throw error
        }
    }
    private func handle(_ error: Error) async {
        errorMessage = APIError.safeMessage(for: error)
        if let error = error as? APIError, error.isAuthenticationFailure {
            sessionGeneration += 1
            clearAccount()
            try? credentials.delete()
            await client.setToken(nil)
            phase = .expired
        }
    }
    private func clearAccount() {
        dataGeneration += 1
        session = nil
        documents = []
        dispatches = []
        senders = []
        capabilities = nil
        accountDeletionRequest = nil
        documentCursor = nil
        dispatchCursor = nil
        isLoading = false
        errorMessage = nil
    }

    #if DEBUG
    func activatePreview() {
        sessionGeneration += 1
        clearAccount()
        isPreview = true
        session = PreviewFixtures.session
        documents = PreviewFixtures.documents
        dispatches = PreviewFixtures.dispatches
        senders = PreviewFixtures.senders
        capabilities = PreviewFixtures.capabilities
        phase = .authenticated
    }
    #endif
}

#if DEBUG
private enum PreviewFixtures {
    private static func decode<T: Decodable>(_ value: String, as: T.Type) -> T {
        // Compile-only fixtures cannot enter release builds or authenticate real requests.
        try! JSONDecoder().decode(T.self, from: Data(value.utf8))
    }
    static let session = decode(#"{"organization":{"id":"preview-org","name":"Atelier Horizon"},"user":{"id":"preview-user","name":"Camille Martin","role":"admin"},"simulation":true,"verifiedAccount":true,"mfa":false}"#, as: MobileSession.self)
    static let capabilities = decode(#"{"version":"1","mode":"preview","simulation":true,"humanApproval":"authenticated_browser","nativeApproval":false,"channels":[{"id":"fax","name":"Fax","liveSending":true},{"id":"email","name":"E-mail","liveSending":false}],"limits":{"pdfBytes":10485760,"pages":100}}"#, as: MobileCapabilities.self)
    static let documents = decode(#"[{"id":"preview-document-1","name":"Dossier de souscription.pdf","sha256":"preview","size":284672,"pages":4,"status":"ready","source":"upload","created_at":"2026-09-22T09:40:00Z","analysis":{"state":"ready","code":"verified","title":"PDF prêt","message":"Document de démonstration.","nextAction":"continue","retryAfterSeconds":null}},{"id":"preview-document-2","name":"Attestation de domicile.pdf","sha256":"preview","size":96320,"pages":1,"status":"quarantined","source":"upload","created_at":"2026-09-22T09:15:00Z","analysis":{"state":"processing","code":"scanning","title":"Vérification en cours","message":"Document de démonstration.","nextAction":"wait","retryAfterSeconds":15}}]"#, as: [DocumentRecord].self)
    static let dispatches = decode(#"[{"id":"preview-dispatch-1","channel":"fax","recipient_json":{"phone":"+33 1 00 00 00 00"},"document_id":"preview-document-1","status":"delivered","mode":"simulation","estimated_minor":24,"ceiling_minor":500,"currency":"EUR","fingerprint":"preview","created_at":"2026-09-22T08:30:00Z","updated_at":"2026-09-22T08:33:00Z"},{"id":"preview-dispatch-2","channel":"fax","recipient_json":{"phone":"+33 1 00 00 00 01"},"document_id":"preview-document-1","status":"prepared","mode":"simulation","estimated_minor":24,"ceiling_minor":500,"currency":"EUR","fingerprint":"preview","created_at":"2026-09-21T14:00:00Z","updated_at":"2026-09-21T14:00:00Z"}]"#, as: [DispatchRecord].self)
    static let senders = decode(#"[{"id":"preview-sender","channel":"fax","name":"Atelier Horizon","address":"Expéditeur de démonstration","status":"verified","mode":"simulation"}]"#, as: [SenderRecord].self)
    static func detail(id: String) throws -> DispatchDetail {
        guard let dispatch = dispatches.first(where: { $0.id == id }) else { throw APIError(code: "NOT_FOUND") }
        return DispatchDetail(dispatch: dispatch, approval: nil,
                              events: [EventRecord(id: "preview-event", type: "dispatch.\(dispatch.status)", eventType: nil, status: dispatch.status, createdAt: dispatch.updatedAt, detail: nil)],
                              attempts: [], approvalUrl: nil)
    }
    @MainActor
    static func documentPDF(id: String) throws -> Data {
        guard let document = documents.first(where: { $0.id == id }), document.isReady else { throw APIError(code: "DOCUMENT_UNAVAILABLE") }
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 595, height: 842))
        return renderer.pdfData { context in
            for page in 1...document.pages {
                context.beginPage()
                let title = "guteneo — Document de démonstration" as NSString
                title.draw(in: CGRect(x: 48, y: 60, width: 499, height: 90), withAttributes: [.font: UIFont.systemFont(ofSize: 24, weight: .semibold)])
                let body = "\(document.name)\n\nPage \(page) sur \(document.pages)\n\nCe document synthétique sert uniquement à vérifier l’affichage natif des PDF. Il ne contient aucune donnée client et n’a jamais été envoyé." as NSString
                body.draw(in: CGRect(x: 48, y: 180, width: 499, height: 420), withAttributes: [.font: UIFont.systemFont(ofSize: 16), .foregroundColor: UIColor.darkGray])
            }
        }
    }
}
#endif
