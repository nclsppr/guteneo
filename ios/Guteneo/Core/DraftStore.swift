import CryptoKit
import Foundation

/// The unprepared dispatch draft of one signed-in identity, kept on this
/// device so that closing the app loses nothing and an interrupted
/// preparation resumes with the same request key (the server then returns
/// the dispatch it already prepared instead of creating a second one).
///
/// A draft holds a recipient and message text. It is written with complete
/// file protection, excluded from backups, never logged, named by a hash of
/// the identity rather than the identity itself, and removed once the
/// dispatch is prepared, the draft is discarded or the person signs out.
struct StoredDraft: Codable, Equatable, Sendable {
    var channel: String
    var recipient: String
    var document: String
    var sender: String
    var subject: String
    var message: String
    var ceiling: String
    var requestKey: String
    /// True while a preparation request may be in flight.
    var preparing: Bool
}

struct DraftStore: Sendable {
    let directory: URL

    static let device = DraftStore(
        directory: (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory)
            .appendingPathComponent("Drafts", isDirectory: true)
    )

    static func identity(organization: String, user: String) -> String {
        "\(organization)\u{0}\(user)"
    }

    private func file(for identity: String) -> URL {
        let digest = SHA256.hash(data: Data(identity.utf8))
            .map { String(format: "%02x", $0) }.joined()
        return directory.appendingPathComponent("\(digest).json")
    }

    func load(identity: String) -> StoredDraft? {
        guard let data = try? Data(contentsOf: file(for: identity)) else { return nil }
        return try? JSONDecoder().decode(StoredDraft.self, from: data)
    }

    func save(_ draft: StoredDraft, identity: String) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var folder = directory
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? folder.setResourceValues(values)
            try JSONEncoder().encode(draft).write(to: file(for: identity), options: [.atomic, .completeFileProtection])
        } catch {
            // A draft that cannot be kept stays in memory only; nothing about
            // its content is reported.
        }
    }

    func clear(identity: String) {
        try? FileManager.default.removeItem(at: file(for: identity))
    }

    func clearAll() {
        try? FileManager.default.removeItem(at: directory)
    }
}
