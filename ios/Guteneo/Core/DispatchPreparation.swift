import Foundation

struct DispatchPreparationState {
    private enum Phase { case editing, preparing, prepared(String) }
    private var phase = Phase.editing
    private(set) var requestKey = UUID().uuidString

    init() {}

    /// A restored draft keeps the key of a preparation that may already have
    /// reached the server, so retrying it returns that dispatch.
    init(restoring requestKey: String) {
        self.requestKey = requestKey
    }

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
        guard case .editing = phase else { return nil }
        phase = .preparing
        return requestKey
    }

    mutating func finish(preparedID: String? = nil) {
        guard case .preparing = phase else { return }
        phase = preparedID.map(Phase.prepared) ?? .editing
    }
}
