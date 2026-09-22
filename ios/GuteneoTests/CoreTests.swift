import Foundation
import PDFKit
import Security
import XCTest
@testable import Guteneo

final class CoreTests: XCTestCase, @unchecked Sendable {
    func testRFC7636ChallengeAndExactCallbackBinding() throws {
        let challenge = AuthorizationChallenge(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", state: String(repeating: "s", count: 43))
        XCTAssertEqual(challenge.challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
        let code = String(repeating: "c", count: 43)
        let callback = "guteneo://auth/callback?code=\(code)&state=\(challenge.state)"
        XCTAssertEqual(try challenge.validateCallback(URL(string: callback)!), code)
        for invalid in [
            callback.replacingOccurrences(of: "guteneo://", with: "https://"),
            callback.replacingOccurrences(of: "auth/callback", with: "evil/callback"),
            callback.replacingOccurrences(of: "/callback?", with: "/callback/extra?"),
            callback + "&state=another",
            callback + "&code=another",
            callback + "#fragment",
            callback.replacingOccurrences(of: challenge.state, with: "wrong-state"),
            callback.replacingOccurrences(of: "auth/", with: "user:password@auth/")
        ] { XCTAssertThrowsError(try challenge.validateCallback(URL(string: invalid)!)) }
    }

    func testRandomPKCEValuesAreIndependentAndURLSafe() throws {
        let first = try AuthorizationChallenge()
        let second = try AuthorizationChallenge()
        XCTAssertEqual(first.verifier.count, 43)
        XCTAssertEqual(first.state.count, 43)
        XCTAssertNotEqual(first.verifier, first.state)
        XCTAssertNotEqual(first.verifier, second.verifier)
        let components = try XCTUnwrap(URLComponents(url: first.authorizeURL, resolvingAgainstBaseURL: false))
        XCTAssertEqual(components.host, "guteneo.com")
        XCTAssertEqual(components.path, "/auth/mobile/authorize")
        XCTAssertFalse(first.authorizeURL.absoluteString.contains(first.verifier))
    }

    func testLateAuthenticationCallbackCannotFinishAReplacementAttempt() throws {
        var attempts = AuthorizationAttemptState()
        let cancelled = try attempts.begin()
        XCTAssertThrowsError(try attempts.begin(), "Only one system login can own the continuation")
        XCTAssertTrue(attempts.finish(cancelled))
        let replacement = try attempts.begin()
        XCTAssertNotEqual(cancelled, replacement)
        XCTAssertFalse(attempts.finish(cancelled), "A delayed callback or cancellation from the previous login is ignored")
        XCTAssertEqual(attempts.activeID, replacement)
        XCTAssertTrue(attempts.finish(replacement))
        XCTAssertNil(attempts.activeID)
        XCTAssertFalse(attempts.finish(replacement), "A duplicate completion cannot resume the same continuation twice")
    }

    func testCredentialExpiryFailsClosedOnMalformedTimestamp() {
        XCTAssertTrue(StoredCredentials(token: "test", expiresAt: "not-a-date").hasExpired)
        XCTAssertTrue(StoredCredentials(token: "test", expiresAt: "2020-01-01T00:00:00Z").hasExpired)
        XCTAssertFalse(StoredCredentials(token: "test", expiresAt: "2099-01-01T00:00:00Z").hasExpired)
    }

    func testActualKeychainRoundTripUsesDeviceOnlyUnlockedProtection() throws {
        let service = "com.guteneo.ios.tests.\(UUID().uuidString)"
        let store = KeychainCredentials(service: service)
        defer { try? store.delete() }
        do {
            XCTAssertNil(try store.load())
            let fixture = StoredCredentials(token: "synthetic-keychain-test-value", expiresAt: "2099-01-01T00:00:00Z")
            try store.save(fixture)
            let restored = try XCTUnwrap(store.load())
            XCTAssertTrue(restored.token == fixture.token)
            XCTAssertEqual(restored.expiresAt, fixture.expiresAt)
            var attributes: CFTypeRef?
            let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                        kSecAttrService as String: service,
                                        kSecAttrAccount as String: "active-session",
                                        kSecReturnAttributes as String: true]
            let result = SecItemCopyMatching(query as CFDictionary, &attributes)
            XCTAssertEqual(result, errSecSuccess, "Security framework OSStatus: \(result)")
            let saved = try XCTUnwrap(attributes as? [String: Any])
            XCTAssertEqual(saved[kSecAttrAccessible as String] as? String, kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
            XCTAssertFalse(saved[kSecAttrSynchronizable as String] as? Bool ?? false)
            try store.delete()
            XCTAssertNil(try store.load())
        } catch let error as APIError {
            XCTFail("Keychain integration failed with Security framework OSStatus: \(error.status)")
        }
    }

    func testReviewURLNeverUsesUntrustedOriginOrPath() {
        XCTAssertEqual(APIClient.reviewURL(dispatchID: "dispatch_123")?.absoluteString, "https://guteneo.com/auth/mobile/review/dispatch_123")
        for invalid in ["", "../billing", "//evil.example", "id?redirect=x", "id#fragment", "id%2Fbilling"] {
            XCTAssertNil(APIClient.reviewURL(dispatchID: invalid))
        }
    }

    func testWebDispatchContractAcceptsBothRecipientRepresentations() throws {
        let object = try decodeDispatch(recipient: #"{"phone":"+33123456789"}"#)
        let serialized = try decodeDispatch(recipient: #""{\"phone\":\"+33123456789\"}""#)
        XCTAssertEqual(object.recipientLabel, "+33123456789")
        XCTAssertEqual(object.recipient, serialized.recipient)
        XCTAssertEqual(object.estimatedMinor, 24)
        XCTAssertEqual(object.documentId, "document-123")
        XCTAssertEqual(object.createdAt, "2026-09-22 09:00:00")
        XCTAssertNotNil(GuteneoDate.parse(object.createdAt))
    }

    func testDeliveryStatusNeverEquatesProviderAcceptanceWithDelivery() throws {
        for (status, expected) in ["accepted": "Pris en charge", "submission_unknown": "Résultat à confirmer", "printed": "Imprimé", "handed_to_post": "Remis à la poste", "delivered": "Distribué"] {
            let dispatch = try decodeDispatch(recipient: #"{"phone":"+33123456789"}"#, status: status)
            XCTAssertEqual(dispatch.statusTitle, expected)
            XCTAssertFalse(dispatch.canCancel)
        }
        XCTAssertTrue(try decodeDispatch(recipient: #"{"phone":"+33123456789"}"#, status: "queued").canCancel)
        XCTAssertTrue(try decodeDispatch(recipient: #"{"phone":"+33123456789"}"#, status: "prepared").canCancel)
    }

    func testDispatchDetailDecodesActualProviderEventContractAfterDelivery() throws {
        let dispatch = try decodeDispatch(recipient: #"{"phone":"+33123456789"}"#, status: "delivered")
        let dispatchJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(dispatch))
        let payload: [String: Any] = [
            "dispatch": dispatchJSON,
            "approval": NSNull(),
            "approvalUrl": "https://guteneo.com/auth/mobile/review/dispatch-123",
            "attempts": [["id": "attempt-123", "provider": "telnyx", "status": "accepted", "created_at": "2026-09-22T09:00:01Z"]],
            "events": [["id": "event-123", "provider": "telnyx", "kind": "delivered", "payload_json": "{}", "occurred_at": "2026-09-22T09:03:00Z", "received_at": "2026-09-22T09:03:05Z", "dispatch_id": "dispatch-123"]]
        ]
        let result = try JSONDecoder().decode(DispatchDetail.self, from: JSONSerialization.data(withJSONObject: payload))
        XCTAssertEqual(result.dispatch.status, "delivered")
        XCTAssertEqual(result.events.count, 1)
        XCTAssertEqual(result.events[0].title, "Envoi distribué")
        XCTAssertEqual(result.events[0].createdAt, "2026-09-22T09:03:00Z")
        XCTAssertNotNil(GuteneoDate.parse(result.events[0].createdAt))
        XCTAssertEqual(result.attempts[0].status, "accepted")
    }

    func testBrowserReviewRejectsUnexpectedServerURL() throws {
        let dispatch = try decodeDispatch(recipient: #"{"phone":"+33123456789"}"#)
        for invalid in ["https://evil.example/auth/mobile/review/dispatch-123", "https://guteneo.com/#/app/billing", "https://guteneo.com/auth/mobile/review/another-id", "https://guteneo.com/auth/mobile/review/dispatch-123?returnTo=/billing"] {
            let detail = DispatchDetail(dispatch: dispatch, approval: nil, events: [], attempts: [], approvalUrl: invalid)
            XCTAssertNil(detail.reviewURL)
        }
        let trusted = "https://guteneo.com/auth/mobile/review/dispatch-123"
        XCTAssertEqual(DispatchDetail(dispatch: dispatch, approval: nil, events: [], attempts: [], approvalUrl: trusted).reviewURL?.absoluteString, trusted)
    }

    func testPreparationNeverEncodesApprovalOrConsent() throws {
        let draft = DispatchDraft(channel: .fax, recipient: ["phone": "+33123456789"], documentId: "document-123", senderId: "sender-123", ceilingMinor: 500)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(draft)) as? [String: Any])
        XCTAssertEqual(json["ceilingMinor"] as? Int, 500)
        XCTAssertNil(json["idempotencyKey"])
        XCTAssertNil(json["approved"])
        XCTAssertNil(json["consent"])
        XCTAssertNil(json["humanApproval"])
    }

    func testAnalysisDoesNotTurnTemporaryDelayIntoSecurityRejection() throws {
        let data = Data(#"{"state":"retryable","code":"engine_unavailable","title":"Unsafe server title","message":"Unsafe server message","nextAction":"rescan","retryAfterSeconds":null}"#.utf8)
        let analysis = try JSONDecoder().decode(DocumentAnalysis.self, from: data)
        XCTAssertTrue(analysis.safeMessage.contains("conservé"))
        XCTAssertTrue(analysis.safeMessage.contains("Relancez"))
        XCTAssertFalse(analysis.safeMessage.contains("Unsafe"))
        XCTAssertFalse(analysis.safeMessage.contains("refusé"))
    }

    func testNativeNetworkingDoesNotPersistBrowserCredentials() {
        let configuration = APIClient.sessionConfiguration()
        XCTAssertNil(configuration.httpCookieStorage)
        XCTAssertFalse(configuration.httpShouldSetCookies)
        XCTAssertNil(configuration.urlCredentialStorage)
        XCTAssertNil(configuration.urlCache)
        XCTAssertEqual(configuration.requestCachePolicy, .reloadIgnoringLocalCacheData)
    }

    func testNativeRequestUsesOnlyExplicitScopedCredentialAndIgnoresServerErrorText() async throws {
        let configuration = APIClient.sessionConfiguration()
        configuration.protocolClasses = [NativeURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        NativeURLProtocol.stub.configure(status: 402, data: Data(#"{"error":{"code":"CREDITS_REQUIRED","message":"SECRET UPSELL MARKER"}}"#.utf8))
        let client = APIClient(session: session)
        await client.setToken("opaque-test-token")
        do {
            _ = try await client.session()
            XCTFail("Expected unavailable operation")
        } catch let error as APIError {
            XCTAssertEqual(error.status, 402)
            XCTAssertFalse(error.localizedDescription.contains("SECRET"))
            XCTAssertFalse(error.localizedDescription.lowercased().contains("crédit"))
            XCTAssertFalse(error.localizedDescription.contains("guteneo.com"))
        }
        let request = try XCTUnwrap(NativeURLProtocol.stub.lastRequest)
        XCTAssertEqual(request.url?.host, "guteneo.com")
        XCTAssertEqual(request.url?.path, "/api/mobile/v1/session")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "GuteneoNative opaque-test-token")
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Origin"))
        XCTAssertNil(request.value(forHTTPHeaderField: "X-CSRF-Token"))
    }

    @MainActor
    func testExpiredServerSessionClearsDeviceCredentialsAndPrivateState() async throws {
        let configuration = APIClient.sessionConfiguration()
        configuration.protocolClasses = [NativeURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel() }
        NativeURLProtocol.stub.configure(status: 401, data: Data(#"{"error":{"code":"NATIVE_SESSION_EXPIRED","message":"ignored"}}"#.utf8))
        let credentials = MemoryCredentials()
        try credentials.save(StoredCredentials(token: "expired-on-server", expiresAt: "2099-01-01T00:00:00Z"))
        let model = AppModel(client: APIClient(session: network), credentials: credentials)
        await model.restoreSession()
        XCTAssertEqual(model.phase, .expired)
        XCTAssertNil(model.session)
        XCTAssertTrue(model.documents.isEmpty)
        XCTAssertTrue(model.dispatches.isEmpty)
        XCTAssertNil(try credentials.load())
    }

    @MainActor
    func testLateRestorationCannotReauthenticateAfterSignOut() async throws {
        let configuration = APIClient.sessionConfiguration()
        configuration.protocolClasses = [NativeURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel() }
        let started = expectation(description: "Restoration request started")
        NativeURLProtocol.stub.configureHandler { request in
            if request.httpMethod == "DELETE" { return (204, Data(), 0) }
            started.fulfill()
            return (200, Self.validSession, 0.2)
        }
        let credentials = MemoryCredentials()
        try credentials.save(StoredCredentials(token: "test-token", expiresAt: "2099-01-01T00:00:00Z"))
        let model = AppModel(client: APIClient(session: network), credentials: credentials)
        let restoration = Task { await model.restoreSession() }
        await fulfillment(of: [started], timeout: 3)
        await model.signOut()
        await restoration.value
        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertNil(model.session)
        XCTAssertNil(try credentials.load())
    }

    @MainActor
    func testSignOutRemovesKeychainBeforeSlowRemoteRevocationFinishes() async throws {
        let configuration = APIClient.sessionConfiguration()
        configuration.protocolClasses = [NativeURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel() }
        let remoteStarted = expectation(description: "Remote revocation started but has not returned")
        NativeURLProtocol.stub.configureHandler { request in
            XCTAssertEqual(request.httpMethod, "DELETE")
            remoteStarted.fulfill()
            return (200, Data(#"{"signedOut":true}"#.utf8), 0.3)
        }
        let credentials = MemoryCredentials()
        try credentials.save(StoredCredentials(token: "test-token", expiresAt: "2099-01-01T00:00:00Z"))
        let client = APIClient(session: network)
        await client.setToken("test-token")
        let model = AppModel(client: client, credentials: credentials)
        let signingOut = Task { await model.signOut() }
        await fulfillment(of: [remoteStarted], timeout: 3)
        XCTAssertTrue(model.isWorking)
        XCTAssertNil(try credentials.load(), "Local credentials must already be gone if the process is terminated now")
        XCTAssertEqual(model.phase, .signedOut)
        await signingOut.value
    }

    @MainActor
    func testLateRefreshCannotRepopulateDocumentsAfterSignOut() async throws {
        let configuration = APIClient.sessionConfiguration()
        configuration.protocolClasses = [NativeURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel() }
        let started = expectation(description: "Documents refresh started")
        NativeURLProtocol.stub.configureHandler { request in
            if request.httpMethod == "DELETE" { return (204, Data(), 0) }
            switch request.url?.lastPathComponent {
            case "session": return (200, Self.validSession, 0)
            case "documents":
                started.fulfill()
                return (200, Data(#"{"items":[{"id":"document-123","name":"Private.pdf","sha256":"sha256","size":100,"pages":1,"status":"ready","source":"upload","created_at":"2026-09-22T09:00:00Z"}],"nextCursor":null}"#.utf8), 0.2)
            case "capabilities": return (200, Data(#"{"version":"1","mode":"live","simulation":false,"humanApproval":"authenticated_browser","nativeApproval":false,"channels":[],"limits":{"pdfBytes":10485760,"pages":100}}"#.utf8), 0)
            case "deletion-request": return (200, Data(#"{"request":null}"#.utf8), 0)
            default: return (200, Data(#"{"items":[],"nextCursor":null}"#.utf8), 0)
            }
        }
        let credentials = MemoryCredentials()
        try credentials.save(StoredCredentials(token: "test-token", expiresAt: "2099-01-01T00:00:00Z"))
        let model = AppModel(client: APIClient(session: network), credentials: credentials)
        let restoration = Task { await model.restoreSession() }
        await fulfillment(of: [started], timeout: 3)
        await model.signOut()
        await restoration.value
        XCTAssertEqual(model.phase, .signedOut)
        XCTAssertNil(model.session)
        XCTAssertTrue(model.documents.isEmpty)
        XCTAssertFalse(model.isLoading)
    }

    #if DEBUG
    @MainActor
    func testPreviewPDFIsReadableWithoutAnyNetworkRequest() async throws {
        let configuration = APIClient.sessionConfiguration()
        configuration.protocolClasses = [NativeURLProtocol.self]
        let network = URLSession(configuration: configuration)
        defer { network.invalidateAndCancel() }
        NativeURLProtocol.stub.configure(status: 500, data: Data())
        let model = AppModel(client: APIClient(session: network), credentials: MemoryCredentials())
        model.activatePreview()
        let document = try XCTUnwrap(model.documents.first(where: \.isReady))
        let data = try await model.documentContent(id: document.id)
        let pdf = try XCTUnwrap(PDFDocument(data: data))
        XCTAssertEqual(pdf.pageCount, document.pages)
        XCTAssertTrue(pdf.string?.contains("démonstration") == true)
        do { _ = try await model.document(id: "unknown"); XCTFail("Unknown fixture must fail locally") }
        catch { XCTAssertNotNil(error as? APIError) }
        XCTAssertNil(NativeURLProtocol.stub.lastRequest)
    }
    #endif

    private static let validSession = Data(#"{"organization":{"id":"org-123","name":"Organisation"},"user":{"id":"user-123","name":"Camille","role":"admin"},"simulation":false,"verifiedAccount":true,"mfa":true,"expiresAt":"2099-01-01T00:00:00Z"}"#.utf8)

    private func decodeDispatch(recipient: String, status: String = "prepared") throws -> DispatchRecord {
        let json = #"{"id":"dispatch-123","channel":"fax","recipient_json":RECIPIENT,"document_id":"document-123","status":"STATUS","mode":"live","estimated_minor":24,"ceiling_minor":500,"currency":"EUR","fingerprint":"sha256","created_at":"2026-09-22 09:00:00","updated_at":"2026-09-22T09:00:00Z"}"#.replacingOccurrences(of: "RECIPIENT", with: recipient).replacingOccurrences(of: "STATUS", with: status)
        return try JSONDecoder().decode(DispatchRecord.self, from: Data(json.utf8))
    }
}

private final class MemoryCredentials: CredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: StoredCredentials?
    func load() throws -> StoredCredentials? { lock.lock(); defer { lock.unlock() }; return value }
    func save(_ credentials: StoredCredentials) throws { lock.lock(); defer { lock.unlock() }; value = credentials }
    func delete() throws { lock.lock(); defer { lock.unlock() }; value = nil }
}

private final class NativeURLProtocol: URLProtocol, @unchecked Sendable {
    final class Stub: @unchecked Sendable {
        private let lock = NSLock()
        private var status = 200
        private var data = Data()
        private var request: URLRequest?
        private var handler: (@Sendable (URLRequest) -> (Int, Data, TimeInterval))?
        func configure(status: Int, data: Data) {
            lock.lock(); defer { lock.unlock() }
            self.status = status; self.data = data; request = nil; handler = nil
        }
        func configureHandler(_ handler: @escaping @Sendable (URLRequest) -> (Int, Data, TimeInterval)) {
            lock.lock(); defer { lock.unlock() }
            self.handler = handler; request = nil
        }
        func response(to request: URLRequest) -> (Int, Data, TimeInterval) {
            lock.lock()
            self.request = request
            let current = handler
            let response = (status, data, TimeInterval(0))
            lock.unlock()
            return current?(request) ?? response
        }
        var lastRequest: URLRequest? { lock.lock(); defer { lock.unlock() }; return request }
    }
    static let stub = Stub()
    private let stopLock = NSLock()
    private var stopped = false
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data, delay) = Self.stub.response(to: request)
        if delay > 0 {
            DispatchQueue.global().asyncAfter(deadline: .now() + delay) { [self] in deliver(status: status, data: data) }
        } else { deliver(status: status, data: data) }
    }
    private func deliver(status: Int, data: Data) {
        stopLock.lock(); let isStopped = stopped; stopLock.unlock()
        guard !isStopped else { return }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { stopLock.lock(); stopped = true; stopLock.unlock() }
}
