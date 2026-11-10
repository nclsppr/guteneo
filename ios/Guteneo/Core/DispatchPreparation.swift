import Foundation

struct DispatchPreparationSnapshot: Codable, Equatable, Sendable {
    let requestKey: String
    let preparedID: String?
    let requiresRecovery: Bool
}

struct DispatchPreparationState {
    private enum Phase { case editing, preparing, recovery, prepared(String) }
    private var phase = Phase.editing
    private(set) var requestKey = UUID().uuidString

    init() { }
    init(restoring snapshot: DispatchPreparationSnapshot) {
        requestKey = snapshot.requestKey
        if let id = snapshot.preparedID { phase = .prepared(id) }
        else if snapshot.requiresRecovery { phase = .recovery }
    }

    var snapshot: DispatchPreparationSnapshot {
        DispatchPreparationSnapshot(requestKey: requestKey, preparedID: preparedID,
                                    requiresRecovery: isPreparing || requiresRecovery)
    }
    var canEdit: Bool { if case .editing = phase { return true }; return false }
    var requiresRecovery: Bool { if case .recovery = phase { return true }; return false }

    var isPreparing: Bool {
        if case .preparing = phase { return true }
        return false
    }
    var preparedID: String? {
        if case .prepared(let id) = phase { return id }
        return nil
    }

    mutating func draftChanged() {
        guard case .editing = phase else { return }
        requestKey = UUID().uuidString
    }

    mutating func begin() -> String? {
        guard canEdit || requiresRecovery else { return nil }
        phase = .preparing
        return requestKey
    }

    mutating func finish(preparedID: String? = nil, requiresRecovery: Bool = false) {
        guard case .preparing = phase else { return }
        phase = preparedID.map(Phase.prepared) ?? (requiresRecovery ? .recovery : .editing)
    }
}
