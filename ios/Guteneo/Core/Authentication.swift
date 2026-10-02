import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

struct StoredCredentials: Codable, Sendable {
    let token: String
    let expiresAt: String
    var hasExpired: Bool { (GuteneoDate.parse(expiresAt) ?? .distantPast) <= Date() }
}

protocol CredentialStore: Sendable {
    func load() throws -> StoredCredentials?
    func save(_ credentials: StoredCredentials) throws
    func delete() throws
}

struct KeychainCredentials: CredentialStore {
    private let service: String
    private let account = "active-session"
    init(service: String = "com.guteneo.ios.native-session") { self.service = service }
    private var identity: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service, kSecAttrAccount as String: account,
         kSecAttrSynchronizable as String: false]
    }
    func load() throws -> StoredCredentials? {
        var query = identity
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw APIError(code: "KEYCHAIN", status: Int(status)) }
        do { return try JSONDecoder().decode(StoredCredentials.self, from: data) }
        catch { try delete(); return nil }
    }
    func save(_ credentials: StoredCredentials) throws {
        let attributes: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(credentials),
                                       kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(identity as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let result = SecItemAdd(identity.merging(attributes) { _, new in new } as CFDictionary, nil)
            guard result == errSecSuccess else { throw APIError(code: "KEYCHAIN", status: Int(result)) }
        } else if status != errSecSuccess { throw APIError(code: "KEYCHAIN", status: Int(status)) }
    }
    func delete() throws {
        let status = SecItemDelete(identity as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw APIError(code: "KEYCHAIN", status: Int(status)) }
    }
}

struct AuthorizationChallenge: Sendable {
    let verifier: String
    let state: String
    var challenge: String { Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }
    var authorizeURL: URL {
        var components = URLComponents(url: APIClient.website, resolvingAgainstBaseURL: false)!
        components.path = "/auth/mobile/authorize"
        components.queryItems = [URLQueryItem(name: "code_challenge", value: challenge),
                                 URLQueryItem(name: "code_challenge_method", value: "S256"),
                                 URLQueryItem(name: "state", value: state)]
        return components.url!
    }
    init() throws {
        verifier = try Self.randomValue()
        state = try Self.randomValue()
    }
    init(verifier: String, state: String) { self.verifier = verifier; self.state = state }
    private static func randomValue() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw APIError(code: "AUTH_START_FAILED") }
        return base64URL(Data(bytes))
    }
    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
    func validateCallback(_ url: URL) throws -> String {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme == "guteneo", components.host == "auth", components.path == "/callback",
              components.user == nil, components.password == nil, components.port == nil, components.fragment == nil else {
            throw APIError(code: "AUTH_CALLBACK_INVALID")
        }
        let values = components.queryItems ?? []
        guard values.filter({ $0.name == "state" }).count == 1,
              values.first(where: { $0.name == "state" })?.value == state,
              values.filter({ $0.name == "code" }).count == 1,
              let code = values.first(where: { $0.name == "code" })?.value,
              (32...256).contains(code.count), APIClient.validIdentifier(code) else {
            throw APIError(code: "AUTH_CALLBACK_INVALID")
        }
        return code
    }
}

/// A cancelled system authentication session may still deliver its callback.
/// Only the attempt owning the current continuation is allowed to resolve it.
struct AuthorizationAttemptState: Sendable {
    private(set) var activeID: UUID?
    mutating func begin() throws -> UUID {
        guard activeID == nil else { throw APIError(code: "AUTH_START_FAILED") }
        let id = UUID()
        activeID = id
        return id
    }
    mutating func finish(_ id: UUID) -> Bool {
        guard activeID == id else { return false }
        activeID = nil
        return true
    }
}

@MainActor
final class MobileAuthenticator: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var authenticationSession: ASWebAuthenticationSession?
    private var continuation: CheckedContinuation<(code: String, verifier: String), Error>?
    private var attempts = AuthorizationAttemptState()

    func authenticate() async throws -> (code: String, verifier: String) {
        guard authenticationSession == nil else { throw APIError(code: "AUTH_START_FAILED") }
        let challenge = try AuthorizationChallenge()
        let attempt = try attempts.begin()
        do {
            return try await withTaskCancellationHandler {
                try Task.checkCancellation()
                return try await withCheckedThrowingContinuation { continuation in
                    self.continuation = continuation
                    let session = ASWebAuthenticationSession(url: challenge.authorizeURL, callbackURLScheme: "guteneo") { [weak self] callback, error in
                        Task { @MainActor in
                            guard let self else { return }
                            if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                                self.finish(.failure(CancellationError()), attempt: attempt)
                            } else if let callback {
                                do { self.finish(.success((try challenge.validateCallback(callback), challenge.verifier)), attempt: attempt) }
                                catch { self.finish(.failure(error), attempt: attempt) }
                            } else { self.finish(.failure(APIError(code: "AUTH_CALLBACK_INVALID")), attempt: attempt) }
                        }
                    }
                    session.presentationContextProvider = self
                    session.prefersEphemeralWebBrowserSession = false
                    self.authenticationSession = session
                    if !session.start() { finish(.failure(APIError(code: "AUTH_START_FAILED")), attempt: attempt) }
                }
            } onCancel: {
                Task { @MainActor [weak self] in self?.cancel(attempt: attempt) }
            }
        } catch {
            finish(.failure(error), attempt: attempt)
            throw error
        }
    }
    func cancel() {
        guard let attempt = attempts.activeID else { return }
        cancel(attempt: attempt)
    }
    private func cancel(attempt: UUID) {
        guard attempts.activeID == attempt else { return }
        authenticationSession?.cancel()
        finish(.failure(CancellationError()), attempt: attempt)
    }
    private func finish(_ result: Result<(code: String, verifier: String), Error>, attempt: UUID) {
        guard attempts.finish(attempt) else { return }
        let pending = continuation
        continuation = nil
        authenticationSession = nil
        pending?.resume(with: result)
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.filter { $0.activationState == .foregroundActive }.flatMap(\.windows).first(where: \.isKeyWindow)
            ?? scenes.flatMap(\.windows).first(where: \.isKeyWindow)
            ?? ASPresentationAnchor()
    }
}
