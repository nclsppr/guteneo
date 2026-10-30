import SwiftUI

struct AccountView: View {
    @Environment(\.locale) private var locale
    @Environment(AppModel.self) private var model
    @State private var deleteConfirmation = false
    @State private var signOutConfirmation = false
    @State private var working = false
    @State private var error: String?
    var body: some View {
        List {
            if let session = model.session {
                Section("Your identity") {
                    LabeledContent("Name", value: session.user.name)
                    LabeledContent("Organisation", value: session.organization.name)
                    LabeledContent("Role", value: L10n.text(session.roleTitle, locale: locale))
                    LabeledContent("Prepare dispatches", value: L10n.text(session.canPrepare ? "Allowed" : "Not allowed", locale: locale))
                    LabeledContent("Approve in the browser", value: L10n.text(session.canApprove ? "Allowed" : "Not allowed", locale: locale))
                    Link("Understand roles", destination: Brand.siteURL("/roles/", locale: locale))
                }
            }
            Section {
                Picker("Preferred language", selection: Binding(get: { model.language }, set: { value in
                    Task {
                        error = nil
                        do { try await model.saveLanguage(value) }
                        catch { self.error = "Saving the language could not be confirmed. Your previous preference has been restored. Refresh your profile before trying again." }
                    }
                })) {
                    ForEach(AppLanguage.allCases) { Text(verbatim: $0.name).tag($0) }
                }.accessibilityIdentifier("accountLanguage").disabled(model.isSavingLanguage)
                if model.isSavingLanguage { ProgressView("Saving language…") }
            } header: { Text("Language") } footer: {
                Text("Your preference is shared between the website and the app. Your documents and messages remain unchanged.")
            }
            Section("Privacy settings") {
                NavigationLink("Your data in the app") { PrivacyView() }
                Link("Privacy policy", destination: Brand.siteURL("/privacy/", locale: locale))
                Text("Documents are downloaded on demand. Your session is kept in this device’s secure Keychain.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Need help?") {
                Link(destination: Brand.supportURL) { Label("Contact support", systemImage: "envelope") }
                NavigationLink("About Guteneo") {
                    List {
                        Wordmark().padding(.vertical)
                        Text("Prepare documents and follow your Guteneo workspace’s dispatches.")
                        LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                        Text("Native app for iPhone and iPad.")
                        Link("Legal notice", destination: Brand.siteURL("/legal/", locale: locale))
                    }.paperList().navigationTitle("About")
                }
            }
            if let error { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
            Section {
                Button("Sign out") { signOutConfirmation = true }.disabled(working)
                    .accessibilityIdentifier("signOut")
            }
            Section("Account deletion") {
                if let request = model.accountDeletionRequest {
                    Label(LocalizedStringKey(request.status == "completed" ? "Deletion completed" : "Deletion request recorded"), systemImage: "person.crop.circle.badge.minus")
                    Text("Requested on \(GuteneoDate.label(request.createdAt, locale: locale))").font(.footnote)
                    if request.status != "completed" {
                        Notice(text: "Your account has not been deleted yet. Processing must take into account ongoing dispatches, your organisation and retention requirements. You will receive confirmation once processing is complete.")
                    }
                } else {
                    Text("Request deletion of your account and associated data. Some records may be retained when legally required.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button("Request account deletion", role: .destructive) { deleteConfirmation = true }
                        .disabled(working).accessibilityIdentifier("deleteAccount")
                }
            }
        }.paperList().navigationTitle(Text(verbatim: L10n.text("Account", locale: locale)))
            .refreshable { await model.refresh() }
            .confirmationDialog("Delete your account?", isPresented: $deleteConfirmation, titleVisibility: .visible) {
                Button("Confirm deletion request", role: .destructive) {
                    Task {
                        working = true; error = nil
                        defer { working = false }
                        do { _ = try await model.requestAccountDeletion() }
                        catch { self.error = APIError.safeMessage(for: error) }
                    }
                }
            } message: {
                Text("This request applies to your Guteneo account on the website and in the app. It does not recall documents already sent. Processing is not immediate.")
            }
            .confirmationDialog("Sign out of this device?", isPresented: $signOutConfirmation, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { await model.signOut() } }
            }
    }
}

struct PrivacyView: View {
    @Environment(\.locale) private var locale
    var body: some View {
        List {
            Section("Account and documents") {
                Text("Guteneo uses your identity and organisation to give you access to your documents and dispatches. The PDFs, recipients and messages you provide are processed to deliver the service.")
            }
            Section("On this device") {
                Text("Your session is stored in the secure Keychain. Viewed PDFs remain in memory while you read them. The app does not request access to your contacts, location, microphone or camera.")
            }
            Section("Your choices") {
                Text("You choose files to import in Files. You can sign out or request account deletion from Account.")
                Link("Read the full policy", destination: Brand.siteURL("/privacy/", locale: locale))
                Link("Ask about your data", destination: Brand.supportURL)
            }
        }.paperList().navigationTitle("Your data").navigationBarTitleDisplayMode(.inline)
    }
}
