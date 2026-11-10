import Foundation

struct DispatchDraftOwner: Codable, Equatable, Hashable, Sendable {
    let userID: String
    let organizationID: String
}

struct DispatchDraftFields: Codable, Equatable, Sendable {
    var channel = Channel.fax
    var recipient = ""
    var selectedDocument = ""
    var selectedSender = ""
    var subject = ""
    var message = ""
    var ceiling = ""
    var hasContent: Bool { !recipient.isEmpty || !subject.isEmpty || !message.isEmpty || !selectedDocument.isEmpty }
    var isBounded: Bool {
        channel != .postal && recipient.utf8.count <= 512 && subject.count <= 200 && message.utf8.count <= 100_000
            && selectedDocument.utf8.count <= 256 && selectedSender.utf8.count <= 256 && ceiling.utf8.count <= 32
    }
}

struct SavedDispatchDraft: Codable, Equatable, Sendable {
    let owner: DispatchDraftOwner
    let fields: DispatchDraftFields
    let preparation: DispatchPreparationSnapshot
    let revision: UUID
    let updatedAt: Date
}

enum DispatchDraftStorageError: Error, Equatable {
    case unavailable, invalidData, capacity, conflict, identityChanged
    var message: String {
        switch self {
        case .capacity: "Draft storage is full. Discard a saved workspace draft before saving another."
        case .conflict: "This draft changed in another window. Close and reopen it before continuing."
        case .identityChanged: "Your account changed. Reopen the draft in its original workspace."
        case .unavailable, .invalidData: "Your draft could not be saved securely. Unlock your device and try again before closing."
        }
    }
}

protocol DispatchDraftDataStore: Sendable {
    func read() throws -> Data?
    func write(_ data: Data) throws
    func clear() throws
}

/// One draft per authenticated identity, with no silent eviction of recovery keys.
struct DispatchDraftVault: Codable {
    static let maximumDrafts = 5
    static let retention: TimeInterval = 7 * 24 * 60 * 60
    static let maximumBytes = 768 * 1024
    private var version = 1
    private(set) var drafts: [SavedDispatchDraft] = []

    init() { }
    static func decode(_ data: Data?) throws -> Self {
        guard let data else { return Self() }
        guard data.count <= maximumBytes, let vault = try? JSONDecoder().decode(Self.self, from: data),
              vault.version == 1, vault.drafts.count <= maximumDrafts,
              Set(vault.drafts.map(\.owner)).count == vault.drafts.count,
              vault.drafts.allSatisfy({ draft in
                  draft.fields.isBounded && UUID(uuidString: draft.preparation.requestKey) != nil
                      && draft.owner.userID.utf8.count <= 256 && !draft.owner.userID.isEmpty
                      && draft.owner.organizationID.utf8.count <= 256 && !draft.owner.organizationID.isEmpty
                      && (draft.preparation.preparedID == nil || draft.preparation.preparedID?.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil)
                      && !(draft.preparation.preparedID != nil && draft.preparation.requiresRecovery)
              }) else { throw DispatchDraftStorageError.invalidData }
        return vault
    }
    mutating func removeExpired(at now: Date) -> Bool {
        let count = drafts.count
        drafts.removeAll { $0.updatedAt <= now.addingTimeInterval(-Self.retention) }
        return count != drafts.count
    }
    mutating func save(owner: DispatchDraftOwner, fields: DispatchDraftFields, preparation: DispatchPreparationSnapshot,
                       replacing revision: UUID?, now: Date) throws -> SavedDispatchDraft {
        let index = drafts.firstIndex { $0.owner == owner }
        guard index.map({ drafts[$0].revision }) == revision else { throw DispatchDraftStorageError.conflict }
        guard index != nil || drafts.count < Self.maximumDrafts else { throw DispatchDraftStorageError.capacity }
        let saved = SavedDispatchDraft(owner: owner, fields: fields, preparation: preparation, revision: UUID(), updatedAt: now)
        if let index { drafts[index] = saved } else { drafts.append(saved) }
        return saved
    }
    mutating func discard(owner: DispatchDraftOwner, revision: UUID) throws {
        guard let index = drafts.firstIndex(where: { $0.owner == owner }), drafts[index].revision == revision else {
            throw DispatchDraftStorageError.conflict
        }
        drafts.remove(at: index)
    }
}

/// Main-actor ownership serializes local read/modify/write across composer windows.
@MainActor
struct DispatchDraftStore {
    let data: any DispatchDraftDataStore
    func load(owner: DispatchDraftOwner, now: Date = Date()) throws -> SavedDispatchDraft? {
        var vault = try DispatchDraftVault.decode(data.read())
        if vault.removeExpired(at: now) { try persist(vault) }
        return vault.drafts.first { $0.owner == owner }
    }
    func save(owner: DispatchDraftOwner, fields: DispatchDraftFields, preparation: DispatchPreparationSnapshot,
              replacing revision: UUID?, now: Date = Date()) throws -> SavedDispatchDraft {
        var vault = try DispatchDraftVault.decode(data.read())
        _ = vault.removeExpired(at: now)
        let saved = try vault.save(owner: owner, fields: fields, preparation: preparation, replacing: revision, now: now)
        try persist(vault)
        return saved
    }
    func discard(owner: DispatchDraftOwner, revision: UUID) throws {
        var vault = try DispatchDraftVault.decode(data.read())
        try vault.discard(owner: owner, revision: revision)
        try persist(vault)
    }
    private func persist(_ vault: DispatchDraftVault) throws {
        if vault.drafts.isEmpty { try data.clear(); return }
        let bytes = try JSONEncoder().encode(vault)
        _ = try DispatchDraftVault.decode(bytes)
        try data.write(bytes)
    }
}
