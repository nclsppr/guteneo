import SwiftUI

/// Apply to each presentation root, including sheets, so its navigation bars
/// and private document content are covered when the scene becomes inactive.
private struct PrivacyShield: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    func body(content: Content) -> some View {
        content.overlay {
            if scenePhase != .active {
                Brand.paper.ignoresSafeArea().overlay { Wordmark() }
                    .accessibilityIdentifier("privacyShield")
            }
        }
    }
}

extension View {
    func privacyShield() -> some View { modifier(PrivacyShield()) }
}

enum Brand {
    static let paper = Color("Paper")
    static let surface = Color("Surface")
    static let ink = Color("Ink")
    static let cobalt = Color("Cobalt")
    static let legalURL = URL(string: "https://guteneo.com/confidentialite/")!
    static let supportURL = URL(string: "mailto:guteneo@pieper.fr")!
}

struct Wordmark: View {
    var body: some View {
        HStack(spacing: 10) {
            Image("BrandPortrait").resizable().scaledToFit().frame(width: 42, height: 42)
                .accessibilityHidden(true)
            Text("guteneo").font(.system(.title, design: .serif)).fontWeight(.semibold)
        }
        .foregroundStyle(Brand.ink)
        .accessibilityElement(children: .ignore).accessibilityLabel("Guteneo")
    }
}

struct Notice: View {
    let text: String
    var symbol = "info.circle"
    var body: some View {
        Label {
            Text(text).fixedSize(horizontal: false, vertical: true)
        } icon: { Image(systemName: symbol) }
        .font(.subheadline).foregroundStyle(.secondary)
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

struct StatusLabel: View {
    let title: String
    let status: String
    private var symbol: String {
        switch status {
        case "ready", "delivered", "fax_transmitted": "checkmark.circle"
        case "failed", "rejected", "blocked", "unknown", "quarantined": "exclamationmark.circle"
        case "cancelled", "purged": "minus.circle"
        default: "clock"
        }
    }
    var body: some View {
        Label(title, systemImage: symbol).font(.caption).fontWeight(.medium)
            .foregroundStyle(status == "failed" || status == "unknown" ? Color.orange : Brand.cobalt)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct DocumentRow: View {
    let document: DocumentRecord
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "doc.text").font(.title2).foregroundStyle(Brand.cobalt)
                .frame(width: 28).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 7) {
                Text(document.name).font(.body).foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(document.pages) page(s) · \(ByteCountFormatter.string(fromByteCount: Int64(document.size), countStyle: .file))")
                    .font(.caption).foregroundStyle(.secondary)
                StatusLabel(title: document.statusTitle, status: document.analysis?.state == "processing" ? "processing" : document.status)
            }
        }.padding(.vertical, 7)
    }
}

struct DispatchRow: View {
    let dispatch: DispatchRecord
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: dispatch.channel.symbol).font(.title2)
                .foregroundStyle(Brand.cobalt).frame(width: 28).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 7) {
                Text(dispatch.recipientLabel).font(.body).foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(dispatch.channel.title) · \(GuteneoDate.label(dispatch.createdAt))")
                    .font(.caption).foregroundStyle(.secondary)
                StatusLabel(title: dispatch.statusTitle, status: dispatch.status)
            }
        }.padding(.vertical, 7)
    }
}

extension View {
    func paperList() -> some View {
        self.scrollContentBackground(.hidden).background(Brand.paper)
    }
}

func amount(_ minor: Int, currency: String = "EUR") -> String {
    (Decimal(minor) / 100).formatted(.currency(code: currency).locale(Locale(identifier: "fr_FR")))
}
