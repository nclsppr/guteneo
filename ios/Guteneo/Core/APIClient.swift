import Foundation

struct APIError: Error, LocalizedError, Equatable, Sendable {
    let code: String
    let status: Int
    init(code: String, status: Int = 0) { self.code = code; self.status = status }
    var isAuthenticationFailure: Bool { status == 401 || ["SESSION_EXPIRED", "NATIVE_SESSION_EXPIRED", "UNAUTHENTICATED"].contains(code) }
    var errorDescription: String? {
        if isAuthenticationFailure { return "Votre session a expiré. Connectez-vous à nouveau pour reprendre." }
        switch code {
        case "NETWORK": return "Connexion interrompue. Actualisez le suivi avant de recommencer une opération."
        case "CANCELLED": return "L’opération a été annulée."
        case "AUTH_CALLBACK_INVALID", "AUTH_START_FAILED": return "La connexion n’a pas abouti. Réessayez depuis cet appareil."
        case "KEYCHAIN": return "Votre session ne peut pas être enregistrée en sécurité sur cet appareil. Réessayez après l’avoir déverrouillé."
        case "INVALID_PDF": return "Choisissez un fichier PDF valide."
        case "FILE_TOO_LARGE", "PAYLOAD_TOO_LARGE": return "Ce PDF est trop volumineux. Choisissez un fichier de 10 Mo maximum."
        case "PDF_NOT_READY", "DOCUMENT_NOT_READY", "DOCUMENT_QUARANTINED": return "Le PDF doit être vérifié avant de préparer cet envoi."
        case "DOCUMENT_UNAVAILABLE", "DOCUMENT_NOT_FOUND", "NOT_FOUND": return "Cet élément est indisponible. Actualisez la liste."
        case "SENDER_NOT_CONFIGURED", "CHANNEL_NOT_AVAILABLE", "CHANNEL_DISABLED", "LIVE_SEND_DISABLED": return "Ce mode d’envoi n’est pas disponible pour votre compte."
        case "QUOTE_EXPIRED", "APPROVAL_EXPIRED": return "Le devis a expiré. Consultez l’envoi dans votre espace Guteneo."
        case "INVALID_INPUT", "VALIDATION_ERROR": return "Vérifiez les informations saisies avant de continuer."
        case "RATE_LIMITED": return "Trop de demandes ont été effectuées. Patientez quelques instants avant de réessayer."
        case "INSUFFICIENT_CREDIT", "INSUFFICIENT_CREDITS", "INSUFFICIENT_BALANCE", "WELCOME_CREDIT_EXHAUSTED": return "Le solde disponible ne permet pas cet envoi."
        case "SIMULATION_UNAVAILABLE": return "Cette application nécessite un compte Guteneo en service réel."
        case "FORBIDDEN", "INSUFFICIENT_ROLE", "NATIVE_SCOPE_DENIED": return "Votre compte ne dispose pas des droits nécessaires à cette action."
        default:
            if status == 403 { return "Cette action n’est pas disponible pour votre compte." }
            if status == 409 { return "La situation de cet envoi a changé. Actualisez son suivi avant de continuer." }
            if status == 429 { return "Patientez quelques instants avant de réessayer." }
            return "Cette opération est momentanément indisponible. Réessayez plus tard ou contactez l’assistance."
        }
    }
    static func safeMessage(for error: Error) -> String {
        if let error = error as? APIError { return error.errorDescription ?? "Opération indisponible." }
        if error is CancellationError { return "L’opération a été annulée." }
        return APIError(code: "NETWORK").errorDescription!
    }
}

/// Never forward credentials through redirects or persist network payloads on disk.
final class NativeSessionDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

actor APIClient {
    static let live = APIClient()
    static let website = URL(string: "https://guteneo.com")!
    static let maximumPDFBytes = 10 * 1024 * 1024
    private let network: URLSession
    private var token: String?
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(session: URLSession? = nil) {
        network = session ?? URLSession(configuration: Self.sessionConfiguration(), delegate: NativeSessionDelegate(), delegateQueue: nil)
    }
    nonisolated static func sessionConfiguration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 45
        configuration.timeoutIntervalForResource = 120
        configuration.waitsForConnectivity = false
        return configuration
    }
    func setToken(_ value: String?) { token = value }

    nonisolated static func reviewURL(dispatchID: String) -> URL? {
        guard validIdentifier(dispatchID) else { return nil }
        var components = URLComponents(url: website, resolvingAgainstBaseURL: false)!
        components.path = "/auth/mobile/review/\(dispatchID)"
        return components.url
    }
    nonisolated static func validIdentifier(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 128 && value.unicodeScalars.allSatisfy {
            CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_").contains($0)
        }
    }
    private func identifier(_ value: String) throws -> String {
        guard Self.validIdentifier(value) else { throw APIError(code: "INVALID_INPUT") }
        return value
    }
    private func endpoint(_ path: String, cursor: String? = nil) -> URL {
        var components = URLComponents(url: Self.website, resolvingAgainstBaseURL: false)!
        components.path = "/api/mobile/v1" + path
        if let cursor { components.queryItems = [URLQueryItem(name: "cursor", value: cursor), URLQueryItem(name: "limit", value: "30")] }
        return components.url!
    }
    private func response(path: String, method: String = "GET", body: Data? = nil,
                          contentType: String = "application/json", cursor: String? = nil,
                          key: String? = nil, authenticated: Bool = true,
                          maximumBytes: Int = 4 * 1024 * 1024) async throws -> (Data, HTTPURLResponse) {
        try Task.checkCancellation()
        var request = URLRequest(url: endpoint(path, cursor: cursor))
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if authenticated {
            guard let token, !token.isEmpty else { throw APIError(code: "SESSION_EXPIRED", status: 401) }
            request.setValue("GuteneoNative \(token)", forHTTPHeaderField: "Authorization")
        }
        if let key { request.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
        do {
            let (stream, rawResponse) = try await network.bytes(for: request)
            guard let response = rawResponse as? HTTPURLResponse else { throw APIError(code: "INVALID_RESPONSE") }
            guard response.expectedContentLength <= maximumBytes else { throw APIError(code: "RESPONSE_TOO_LARGE") }
            var data = Data()
            for try await byte in stream {
                if data.count >= maximumBytes { throw APIError(code: "RESPONSE_TOO_LARGE") }
                data.append(byte)
            }
            try Task.checkCancellation()
            guard (200...299).contains(response.statusCode) else {
                struct Failure: Decodable { struct Detail: Decodable { let code: String? }; let error: Detail? }
                let failure = try? decoder.decode(Failure.self, from: data)
                throw APIError(code: failure?.error?.code ?? "HTTP_ERROR", status: response.statusCode)
            }
            return (data, response)
        } catch is CancellationError { throw CancellationError() }
        catch let error as APIError { throw error }
        catch let error as URLError where error.code == .cancelled { throw CancellationError() }
        catch { throw APIError(code: "NETWORK") }
    }
    private func request<Result: Decodable>(_ type: Result.Type, path: String, method: String = "GET",
                                           body: Data? = nil, cursor: String? = nil, key: String? = nil,
                                           authenticated: Bool = true) async throws -> Result {
        let (data, _) = try await response(path: path, method: method, body: body, cursor: cursor, key: key, authenticated: authenticated)
        do { return try decoder.decode(type, from: data) }
        catch { throw APIError(code: "INVALID_RESPONSE") }
    }
    func exchange(code: String, verifier: String) async throws -> SessionExchange {
        let body = try encoder.encode(["code": code, "codeVerifier": verifier])
        return try await request(SessionExchange.self, path: "/session", method: "POST", body: body, authenticated: false)
    }
    func session() async throws -> MobileSession { try await request(MobileSession.self, path: "/session") }
    func capabilities() async throws -> MobileCapabilities { try await request(MobileCapabilities.self, path: "/capabilities") }
    func documents(cursor: String? = nil) async throws -> Page<DocumentRecord> { try await request(Page<DocumentRecord>.self, path: "/documents", cursor: cursor) }
    func document(id: String) async throws -> DocumentRecord { try await request(DocumentRecord.self, path: "/documents/\(identifier(id))") }
    func dispatches(cursor: String? = nil) async throws -> Page<DispatchRecord> { try await request(Page<DispatchRecord>.self, path: "/dispatches", cursor: cursor) }
    func dispatchDetail(id: String) async throws -> DispatchDetail { try await request(DispatchDetail.self, path: "/dispatches/\(identifier(id))") }
    func senders() async throws -> [SenderRecord] {
        struct Senders: Decodable { let items: [SenderRecord] }
        return try await request(Senders.self, path: "/senders").items
    }
    func rescanDocument(id: String) async throws -> DocumentRecord {
        try await request(DocumentRecord.self, path: "/documents/\(identifier(id))/rescan", method: "POST", body: Data("{}".utf8))
    }
    func prepareDispatch(_ draft: DispatchDraft) async throws -> DispatchRecord {
        guard draft.channel != .postal, draft.ceilingMinor > 0, !draft.recipient.isEmpty else { throw APIError(code: "INVALID_INPUT") }
        return try await request(DispatchRecord.self, path: "/dispatches", method: "POST", body: encoder.encode(draft), key: draft.idempotencyKey)
    }
    func cancelDispatch(id: String) async throws {
        _ = try await response(path: "/dispatches/\(identifier(id))/cancel", method: "POST", body: Data("{}".utf8))
    }
    func logout() async throws { _ = try await response(path: "/session", method: "DELETE") }
    func requestAccountDeletion() async throws -> AccountDeletionRequest {
        try await request(AccountDeletionRequest.self, path: "/account/deletion-request", method: "POST", body: Data("{\"confirmed\":true}".utf8))
    }
    func accountDeletionRequest() async throws -> AccountDeletionRequest? {
        struct Result: Decodable { let request: AccountDeletionRequest? }
        return try await request(Result.self, path: "/account/deletion-request").request
    }
    func documentContent(id: String) async throws -> Data {
        let (data, response) = try await response(path: "/documents/\(identifier(id))/content", maximumBytes: Self.maximumPDFBytes)
        guard response.mimeType == "application/pdf", data.starts(with: Data("%PDF-".utf8)) else { throw APIError(code: "DOCUMENT_UNAVAILABLE") }
        return data
    }
    func uploadPDF(at url: URL, maximumBytes: Int = APIClient.maximumPDFBytes) async throws -> DocumentRecord {
        guard url.isFileURL, url.pathExtension.lowercased() == "pdf" else { throw APIError(code: "INVALID_PDF") }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        let boundedMaximum = min(maximumBytes, Self.maximumPDFBytes)
        guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= boundedMaximum else { throw APIError(code: "FILE_TOO_LARGE") }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: boundedMaximum + 1) ?? Data()
        guard data.count <= boundedMaximum else { throw APIError(code: "FILE_TOO_LARGE") }
        guard data.starts(with: Data("%PDF-".utf8)) else { throw APIError(code: "INVALID_PDF") }
        try Task.checkCancellation()
        let boundary = "Guteneo-\(UUID().uuidString)"
        let filename = url.lastPathComponent.filter { !"\r\n\"\\/".contains($0) }
        var body = Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: application/pdf\r\n\r\n".utf8)
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        let (result, _) = try await response(path: "/documents", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
        do { return try decoder.decode(DocumentRecord.self, from: result) }
        catch { throw APIError(code: "INVALID_RESPONSE") }
    }
}
