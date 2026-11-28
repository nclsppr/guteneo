import Foundation

enum FaxAddress {
    static func normalized(_ input: String) -> String {
        input.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^\+(33|352|44|49)[\s.-]*\(0\)"#, with: "+$1", options: .regularExpression)
            .replacingOccurrences(of: #"[\s.()-]"#, with: "", options: .regularExpression)
    }

    static func isValid(_ input: String) -> Bool {
        let number = normalized(input)
        return number.range(of: #"^\+[1-9][0-9]{6,14}$"#, options: .regularExpression) != nil
            && number.range(of: #"^\+(33|352|44|49)0"#, options: .regularExpression) == nil
    }
}

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
