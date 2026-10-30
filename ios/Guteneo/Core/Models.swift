import Foundation

enum Channel: String, Codable, CaseIterable, Identifiable, Sendable {
    case fax, email, postal
    var id: String { rawValue }
    var title: String {
        switch self { case .fax: "Fax"; case .email: "Email"; case .postal: "Post" }
    }
    var symbol: String {
        switch self { case .fax: "printer"; case .email: "envelope"; case .postal: "envelope.badge.shield.half.filled" }
    }
}

struct MobileSession: Codable, Sendable {
    struct Organization: Codable, Sendable { let id: String; let name: String }
    struct User: Codable, Sendable { let id: String; let name: String; let role: String; let preferredLocale: AppLanguage? }
    struct Permissions: Codable, Sendable {
        let prepareDispatches: Bool
        let approveDispatches: Bool
        let viewReports: Bool
    }
    let permissions: Permissions?
    var canPrepare: Bool { permissions?.prepareDispatches ?? ["admin", "member"].contains(user.role) }
    var canApprove: Bool { permissions?.approveDispatches ?? (user.role == "admin") }
    var roleTitle: String {
        switch user.role {
        case "admin": "Administrator"
        case "supervisor": "Supervisor"
        case "member": "Operator"
        case "viewer": "Observer"
        default: "Access unavailable"
        }
    }
    let organization: Organization
    let user: User
    let simulation: Bool
    let verifiedAccount: Bool?
    let mfa: Bool?
    let expiresAt: String?
}

struct SessionExchange: Decodable, Sendable {
    let token: String
    let expiresAt: String
    let session: MobileSession
}

struct MobileCapabilities: Decodable, Sendable {
    struct AvailableChannel: Decodable, Identifiable, Sendable {
        let id: Channel
        let name: String
        let liveSending: Bool
    }
    struct Limits: Decodable, Sendable {
        let pdfBytes: Int
        let pages: Int?
    }
    let version: String
    let mode: String
    let simulation: Bool
    let humanApproval: String
    let nativeApproval: Bool
    let channels: [AvailableChannel]
    let limits: Limits
    var preparableChannels: [Channel] {
        channels.filter { $0.liveSending && $0.id != .postal }.map(\.id)
    }
}

struct Page<Item: Decodable & Sendable>: Decodable, Sendable {
    let items: [Item]
    let nextCursor: String?
}

struct DocumentAnalysis: Codable, Sendable {
    let state: String
    let code: String
    let title: String
    let message: String
    let nextAction: String
    let retryAfterSeconds: Int?

    // Local, reviewed copy keeps recovery distinct from an infection verdict.
    var safeTitle: String {
        switch state {
        case "ready": "PDF ready"
        case "processing": "Verification in progress"
        case "retryable": "Verification needs retrying"
        default: "PDF unavailable"
        }
    }
    var safeMessage: String {
        switch code {
        case "security_rejected": return "The security check rejected this PDF. Check the original file or choose another PDF."
        case "pdf_rejected": return "Check that the PDF opens correctly and is not password protected."
        case "service_not_configured", "signatures_stale": return "Your PDF is preserved. The verification service is unavailable; contact support."
        case "access_revoked": return "Your permissions have changed. An administrator of your organisation can restart verification."
        default: break
        }
        switch state {
        case "ready": return "Your PDF has been verified. You can prepare your dispatch."
        case "processing": return "Your PDF is saved. Verification may take a few minutes. You do not need to upload it again."
        case "retryable": return "Your PDF is preserved. Restart verification without uploading it again."
        default: return "Verification cannot be completed. Choose another PDF or contact support."
        }
    }
}

struct DocumentRecord: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let sha256: String
    let size: Int
    let pages: Int
    let status: String
    let source: String
    let createdAt: String
    let analysis: DocumentAnalysis?
    enum CodingKeys: String, CodingKey {
        case id, name, sha256, size, pages, status, source, analysis
        case createdAt = "created_at"
    }
    var isReady: Bool { status == "ready" && (analysis == nil || analysis?.state == "ready") }
    var canRescan: Bool { analysis?.nextAction == "rescan" }
    var statusTitle: String {
        if isReady { return "Ready" }
        if analysis?.state == "processing" { return "Verification in progress" }
        if canRescan { return "Needs verification" }
        return "Unavailable"
    }
}

struct DispatchRecord: Codable, Identifiable, Sendable {
    struct FaxPricing: Codable, Sendable {
        // Only the execution boundary is needed here. Server presentation may
        // contain funding copy and is never decoded into native UI content.
        let executionScope: String?
    }
    let id: String
    let channel: Channel
    let recipient: [String: String]
    let documentId: String?
    let senderAddress: String?
    let subject: String?
    let text: String?
    let status: String
    let mode: String
    let estimatedMinor: Int
    let ceilingMinor: Int
    let quoteExpiresAt: String?
    let faxPricing: FaxPricing?
    let currency: String
    let fingerprint: String
    let createdAt: String
    let updatedAt: String
    enum CodingKeys: String, CodingKey {
        case id, channel, subject, text, status, mode, currency, fingerprint, faxPricing
        case recipient = "recipient_json", documentId = "document_id", senderAddress = "sender_address"
        case estimatedMinor = "estimated_minor", ceilingMinor = "ceiling_minor", quoteExpiresAt = "quote_expires_at"
        case createdAt = "created_at", updatedAt = "updated_at"
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        channel = try c.decode(Channel.self, forKey: .channel)
        if let object = try? c.decode([String: String].self, forKey: .recipient) { recipient = object }
        else {
            let serialized = try c.decode(String.self, forKey: .recipient)
            recipient = try JSONDecoder().decode([String: String].self, from: Data(serialized.utf8))
        }
        documentId = try c.decodeIfPresent(String.self, forKey: .documentId)
        senderAddress = try c.decodeIfPresent(String.self, forKey: .senderAddress)
        subject = try c.decodeIfPresent(String.self, forKey: .subject)
        text = try c.decodeIfPresent(String.self, forKey: .text)
        status = try c.decode(String.self, forKey: .status)
        mode = try c.decode(String.self, forKey: .mode)
        estimatedMinor = try c.decode(Int.self, forKey: .estimatedMinor)
        ceilingMinor = try c.decode(Int.self, forKey: .ceilingMinor)
        quoteExpiresAt = try c.decodeIfPresent(String.self, forKey: .quoteExpiresAt)
        faxPricing = try c.decodeIfPresent(FaxPricing.self, forKey: .faxPricing)
        currency = try c.decode(String.self, forKey: .currency)
        fingerprint = try c.decode(String.self, forKey: .fingerprint)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        updatedAt = try c.decode(String.self, forKey: .updatedAt)
    }
    var recipientLabel: String {
        recipient["email"] ?? recipient["phone"] ?? [recipient["name"], recipient["city"], recipient["country"]].compactMap { $0 }.joined(separator: ", ")
    }
    var statusTitle: String {
        if isReviewPreparation { return "Reference preparation" }
        if status == "prepared", faxPricing?.executionScope != nil { return "Available to view" }
        return switch status {
        case "draft", "prepared", "quoted", "pending_approval", "awaiting_approval": "Awaiting approval"
        case "approved": "Approved"
        case "queued": "Queued"
        case "accepted": "Accepted by provider"
        case "sending", "submitted", "submitting", "processing": "In progress"
        case "delivered": "Delivered"
        case "failed", "rejected", "bounced": "Failed"
        case "complained": "Reported by recipient"
        case "printed": "Printed"
        case "handed_to_post": "Handed to the post"
        case "cancelled", "canceled": "Cancelled"
        case "expired": "Quote expired"
        case "unknown", "submission_unknown": "Outcome unconfirmed"
        default: "Tracking in progress"
        }
    }
    var isReviewPreparation: Bool { faxPricing?.executionScope == "review_prepare_only" }
    // Expired ordinary quotes remain accessible in the browser for renewal.
    // An unrecognized scope cannot introduce a new approval capability.
    var canHumanReview: Bool { status == "prepared" && faxPricing?.executionScope == nil }
    var canCancel: Bool { ["prepared", "queued"].contains(status) }
}

struct EventRecord: Decodable, Identifiable, Sendable {
    let id: String
    let type: String?
    let eventType: String?
    let status: String?
    let createdAt: String
    let detail: String?
    enum CodingKeys: String, CodingKey {
        case id, type, status, detail
        case eventType = "event_type", createdAt = "created_at"
        case kind, occurredAt = "occurred_at", receivedAt = "received_at"
    }
    init(id: String, type: String?, eventType: String?, status: String?, createdAt: String, detail: String?) {
        self.id = id
        self.type = type
        self.eventType = eventType
        self.status = status
        self.createdAt = createdAt
        self.detail = detail
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        eventType = try c.decodeIfPresent(String.self, forKey: .kind) ?? c.decodeIfPresent(String.self, forKey: .eventType)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        detail = try c.decodeIfPresent(String.self, forKey: .detail)
        // Domain.getDispatch returns provider occurrence/receipt timestamps.
        // Keep compatibility with the older web/preview event shape as a fallback.
        createdAt = try c.decodeIfPresent(String.self, forKey: .occurredAt)
            ?? c.decodeIfPresent(String.self, forKey: .receivedAt)
            ?? c.decode(String.self, forKey: .createdAt)
    }
    var title: String {
        switch status ?? eventType ?? type ?? "" {
        case "delivered", "dispatch.delivered": "Dispatch delivered"
        case "failed", "dispatch.failed": "Dispatch failed"
        case "approved", "dispatch.approved": "Dispatch approved"
        case "cancelled", "dispatch.cancelled": "Dispatch cancelled"
        case "queued", "dispatch.queued": "Dispatch queued"
        case "prepared", "dispatch.prepared": "Dispatch prepared"
        case "accepted", "dispatch.accepted": "Accepted by the provider"
        case "submitting", "dispatch.submitting": "Transmission in progress"
        case "submission_unknown", "dispatch.submission_unknown": "Outcome unconfirmed"
        case "bounced", "dispatch.bounced": "Dispatch not delivered"
        case "complained", "dispatch.complained": "Complaint received"
        case "printed", "dispatch.printed": "Letter printed"
        case "handed_to_post", "dispatch.handed_to_post": "Letter handed to the post"
        default: "Tracking updated"
        }
    }
}

struct DispatchDetail: Decodable, Sendable {
    struct Approval: Decodable, Sendable {
        let fingerprint: String
        let expiresAt: String
        let approvalKind: String?
        enum CodingKeys: String, CodingKey {
            case fingerprint
            case expiresAt = "expires_at", approvalKind = "approval_kind"
        }
    }
    struct Attempt: Decodable, Identifiable, Sendable {
        let id: String
        let provider: String?
        let status: String
        let createdAt: String
        enum CodingKeys: String, CodingKey { case id, provider, status; case createdAt = "created_at" }
    }
    let dispatch: DispatchRecord
    let approval: Approval?
    let events: [EventRecord]
    let attempts: [Attempt]
    let approvalUrl: String?
    var reviewURL: URL? {
        guard let approvalUrl, let candidate = URL(string: approvalUrl),
              candidate == APIClient.reviewURL(dispatchID: dispatch.id) else { return nil }
        return candidate
    }
}

struct SenderRecord: Codable, Identifiable, Sendable {
    let id: String
    let channel: Channel
    let name: String?
    let address: String?
    let status: String?
    let mode: String?
    var displayName: String { name ?? address ?? channel.title }
}

struct DispatchDraft: Encodable, Sendable {
    var channel: Channel
    var recipient: [String: String]
    var documentId: String?
    var senderId: String?
    var subject: String?
    var text: String?
    var ceilingMinor: Int
    var idempotencyKey = UUID().uuidString
    enum CodingKeys: String, CodingKey { case channel, recipient, documentId, senderId, subject, text, ceilingMinor }
}

struct AccountDeletionRequest: Codable, Identifiable, Sendable {
    let id: String
    let status: String
    let createdAt: String
    // The server message is intentionally not decoded into customer-facing copy.
}

enum GuteneoDate {
    static func parse(_ value: String) -> Date? {
        let normalized = value.contains("T") ? value : value.replacingOccurrences(of: " ", with: "T")
        let hasZone = normalized.hasSuffix("Z") || normalized.range(of: "[+-]\\d{2}:\\d{2}$", options: .regularExpression) != nil
        let full = hasZone ? normalized : normalized + "Z"
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: full) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: full)
    }
    static func label(_ value: String, locale: Locale = Locale(identifier: "fr_FR")) -> String {
        guard let date = parse(value) else { return L10n.text("Date unavailable", locale: locale) }
        return date.formatted(.dateTime.day().month(.abbreviated).year().hour().minute().locale(locale))
    }
}
