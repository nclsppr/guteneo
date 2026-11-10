import Foundation
import Security
import XCTest
@testable import Guteneo

final class DispatchDraftTests: XCTestCase, @unchecked Sendable {
    private let owner = DispatchDraftOwner(userID: "user-1", organizationID: "org-1")
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private var fields: DispatchDraftFields {
        var fields = DispatchDraftFields()
        fields.channel = .email; fields.recipient = "synthetic@example.invalid"
        fields.subject = "Résumé – Entworf"; fields.message = "Exact original\n\n☎️ বাংলা"
        fields.selectedDocument = "document-1"; fields.selectedSender = "sender-1"; fields.ceiling = "2,00"
        return fields
    }

    @MainActor
    func testExactDraftAndKeySurviveStoreRecreationWithoutCrossingIdentity() throws {
        let data = MemoryDispatchDraftData()
        let state = DispatchPreparationState()
        let original = try DispatchDraftStore(data: data).save(owner: owner, fields: fields, preparation: state.snapshot, replacing: nil, now: now)
        let relaunched = DispatchDraftStore(data: data)
        XCTAssertEqual(try relaunched.load(owner: owner, now: now), original)
        XCTAssertEqual(original.fields, fields)
        XCTAssertEqual(original.preparation.requestKey, state.requestKey)
        XCTAssertNil(try relaunched.load(owner: DispatchDraftOwner(userID: "other-user", organizationID: owner.organizationID), now: now))
        XCTAssertNil(try relaunched.load(owner: DispatchDraftOwner(userID: owner.userID, organizationID: "other-org"), now: now))
    }

    @MainActor
    func testInterruptedPreparationRestoresLockedSameKeyUntilExplicitRecovery() throws {
        let data = MemoryDispatchDraftData()
        var state = DispatchPreparationState()
        let originalKey = try XCTUnwrap(state.begin())
        _ = try DispatchDraftStore(data: data).save(owner: owner, fields: fields, preparation: state.snapshot, replacing: nil, now: now)
        let saved = try XCTUnwrap(DispatchDraftStore(data: data).load(owner: owner, now: now))
        var resumed = DispatchPreparationState(restoring: saved.preparation)
        XCTAssertFalse(resumed.isPreparing, "Restoration must not start an operation")
        XCTAssertTrue(resumed.requiresRecovery)
        XCTAssertFalse(resumed.canEdit, "An uncertain preparation cannot silently become an edited new request")
        resumed.draftChanged()
        XCTAssertEqual(resumed.requestKey, originalKey)
        XCTAssertEqual(resumed.begin(), originalKey)
        resumed.finish(preparedID: "dispatch-original")
        XCTAssertEqual(resumed.preparedID, "dispatch-original")
    }

    @MainActor
    func testPreparedReferenceRestoresTrackingWithoutAnotherBegin() throws {
        let data = MemoryDispatchDraftData()
        var state = DispatchPreparationState()
        _ = state.begin(); state.finish(preparedID: "dispatch-reference")
        _ = try DispatchDraftStore(data: data).save(owner: owner, fields: fields, preparation: state.snapshot, replacing: nil, now: now)
        let saved = try XCTUnwrap(DispatchDraftStore(data: data).load(owner: owner, now: now))
        var resumed = DispatchPreparationState(restoring: saved.preparation)
        XCTAssertEqual(resumed.preparedID, "dispatch-reference")
        XCTAssertNil(resumed.begin(), "A recovered reference is a tracking receipt, never send authority")
    }

    @MainActor
    func testStaleComposerCannotOverwriteOrDiscardAnotherWindow() throws {
        let data = MemoryDispatchDraftData()
        let store = DispatchDraftStore(data: data)
        let first = try store.save(owner: owner, fields: fields, preparation: DispatchPreparationState().snapshot, replacing: nil, now: now)
        var edited = fields; edited.subject = "Current window"
        let current = try store.save(owner: owner, fields: edited, preparation: first.preparation, replacing: first.revision, now: now)
        XCTAssertThrowsError(try store.save(owner: owner, fields: fields, preparation: first.preparation, replacing: first.revision, now: now)) {
            XCTAssertEqual($0 as? DispatchDraftStorageError, .conflict)
        }
        XCTAssertThrowsError(try store.discard(owner: owner, revision: first.revision))
        XCTAssertEqual(try store.load(owner: owner, now: now), current)
    }

    @MainActor
    func testFailedSecureWriteRetainsPriorReceiptAndCanRetryTheSameRevision() throws {
        let data = MemoryDispatchDraftData()
        let store = DispatchDraftStore(data: data)
        var state = DispatchPreparationState()
        let first = try store.save(owner: owner, fields: fields, preparation: state.snapshot, replacing: nil, now: now)
        let key = state.begin()
        data.failWrites = true
        XCTAssertThrowsError(try store.save(owner: owner, fields: fields, preparation: state.snapshot, replacing: first.revision, now: now))
        XCTAssertEqual(try store.load(owner: owner, now: now), first)
        data.failWrites = false
        let pending = try store.save(owner: owner, fields: fields, preparation: state.snapshot, replacing: first.revision, now: now)
        XCTAssertEqual(pending.preparation.requestKey, key)
        XCTAssertTrue(pending.preparation.requiresRecovery)
    }

    @MainActor
    func testSevenDayExpiryPurgesRatherThanResumingAnOldRecoveryKey() throws {
        let data = MemoryDispatchDraftData()
        let store = DispatchDraftStore(data: data)
        _ = try store.save(owner: owner, fields: fields, preparation: DispatchPreparationState().snapshot, replacing: nil, now: now)
        XCTAssertNotNil(try store.load(owner: owner, now: now.addingTimeInterval(DispatchDraftVault.retention - 1)))
        XCTAssertNil(try store.load(owner: owner, now: now.addingTimeInterval(DispatchDraftVault.retention)))
        XCTAssertTrue(try DispatchDraftVault.decode(data.read()).drafts.isEmpty)
    }

    @MainActor
    func testClockCorrectionDoesNotEraseAnUnexpiredRecoveryKey() throws {
        let data = MemoryDispatchDraftData()
        let store = DispatchDraftStore(data: data)
        var state = DispatchPreparationState(); _ = state.begin()
        let saved = try store.save(owner: owner, fields: fields, preparation: state.snapshot, replacing: nil, now: now)
        XCTAssertEqual(try store.load(owner: owner, now: now.addingTimeInterval(-3600)), saved)
    }

    @MainActor
    func testBoundedDeviceVaultNeverEvictsAnUnexpiredRecoveryDraft() throws {
        let data = MemoryDispatchDraftData()
        let store = DispatchDraftStore(data: data)
        for index in 0..<DispatchDraftVault.maximumDrafts {
            _ = try store.save(owner: DispatchDraftOwner(userID: "user-\(index)", organizationID: "org"), fields: fields,
                               preparation: DispatchPreparationState().snapshot, replacing: nil, now: now)
        }
        XCTAssertThrowsError(try store.save(owner: owner, fields: fields, preparation: DispatchPreparationState().snapshot, replacing: nil, now: now)) {
            XCTAssertEqual($0 as? DispatchDraftStorageError, .capacity)
        }
        XCTAssertEqual(try DispatchDraftVault.decode(data.read()).drafts.count, DispatchDraftVault.maximumDrafts)
    }

    @MainActor
    func testDiscardIsScopedAndDoesNotRemoveOtherWorkspaceDrafts() throws {
        let data = MemoryDispatchDraftData()
        let store = DispatchDraftStore(data: data)
        let original = try store.save(owner: owner, fields: fields, preparation: DispatchPreparationState().snapshot, replacing: nil, now: now)
        let otherOwner = DispatchDraftOwner(userID: owner.userID, organizationID: "other-org")
        let other = try store.save(owner: otherOwner, fields: fields, preparation: DispatchPreparationState().snapshot, replacing: nil, now: now)
        try store.discard(owner: owner, revision: original.revision)
        XCTAssertNil(try store.load(owner: owner, now: now))
        XCTAssertEqual(try store.load(owner: otherOwner, now: now), other)
    }

    @MainActor
    func testCorruptUnknownVersionAndOversizedDraftsFailClosed() throws {
        for bytes in [Data("not JSON".utf8), Data(#"{"version":2,"drafts":[]}"#.utf8), Data(repeating: 65, count: DispatchDraftVault.maximumBytes + 1)] {
            let data = MemoryDispatchDraftData(bytes: bytes)
            XCTAssertThrowsError(try DispatchDraftStore(data: data).load(owner: owner, now: now))
            XCTAssertEqual(try data.read(), bytes, "A failed decode must not silently erase existing recovery data")
        }
        let data = MemoryDispatchDraftData()
        var excessive = fields; excessive.message = String(repeating: "a", count: 100_001)
        XCTAssertThrowsError(try DispatchDraftStore(data: data).save(owner: owner, fields: excessive,
                            preparation: DispatchPreparationState().snapshot, replacing: nil, now: now))
        XCTAssertNil(try data.read())
    }
}

#if os(iOS)
final class DispatchDraftKeychainTests: XCTestCase {
    func testDraftKeychainUsesDeviceOnlyUnlockedNonSynchronizingProtection() throws {
        let service = "com.guteneo.ios.draft-tests.\(UUID().uuidString)"
        let identity: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        defer { SecItemDelete(identity as CFDictionary) }
        let store = KeychainDispatchDraftData(service: service)
        XCTAssertNil(try store.read())
        let bytes = Data("synthetic protected draft fixture".utf8)
        try store.write(bytes)
        XCTAssertEqual(try store.read(), bytes)
        var query = identity; query[kSecReturnAttributes as String] = true
        var result: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(query as CFDictionary, &result), errSecSuccess)
        let attributes = try XCTUnwrap(result as? [String: Any])
        XCTAssertEqual(attributes[kSecAttrAccessible as String] as? String, kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String)
        XCTAssertFalse(attributes[kSecAttrSynchronizable as String] as? Bool ?? false)
    }
}
#endif

final class MemoryDispatchDraftData: DispatchDraftDataStore, @unchecked Sendable {
    private let lock = NSLock()
    private var bytes: Data?
    var failWrites = false
    init(bytes: Data? = nil) { self.bytes = bytes }
    func read() throws -> Data? { lock.lock(); defer { lock.unlock() }; return bytes }
    func write(_ data: Data) throws {
        lock.lock(); defer { lock.unlock() }
        guard !failWrites else { throw DispatchDraftStorageError.unavailable }
        bytes = data
    }
    func clear() throws {
        lock.lock(); defer { lock.unlock() }
        guard !failWrites else { throw DispatchDraftStorageError.unavailable }
        bytes = nil
    }
}
