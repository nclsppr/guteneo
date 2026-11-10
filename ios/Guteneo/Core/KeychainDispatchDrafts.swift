import Foundation
import Security

struct KeychainDispatchDraftData: DispatchDraftDataStore {
    private let service: String
    init(service: String = "com.guteneo.ios.dispatch-drafts") { self.service = service }
    private var identity: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "workspace-drafts-v1", kSecAttrSynchronizable as String: false]
    }
    func read() throws -> Data? {
        var query = identity
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let bytes = result as? Data else { throw DispatchDraftStorageError.unavailable }
        return bytes
    }
    func write(_ data: Data) throws {
        let values: [String: Any] = [kSecValueData as String: data,
                                     kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(identity as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            guard SecItemAdd(identity.merging(values) { _, value in value } as CFDictionary, nil) == errSecSuccess else {
                throw DispatchDraftStorageError.unavailable
            }
        } else if status != errSecSuccess { throw DispatchDraftStorageError.unavailable }
    }
    func clear() throws {
        let status = SecItemDelete(identity as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw DispatchDraftStorageError.unavailable }
    }
}
