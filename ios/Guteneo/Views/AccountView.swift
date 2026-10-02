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
                Section("Votre identité") {
                    LabeledContent("Nom", value: session.user.name)
                    LabeledContent("Organisation", value: session.organization.name)
                    LabeledContent("Rôle", value: L10n.text(session.user.role == "admin" ? "Administrateur" : session.user.role == "viewer" ? "Lecture seule" : "Membre", locale: locale))
                }
            }
            Section {
                Picker("Langue préférée", selection: Binding(get: { model.language }, set: { value in
                    Task {
                        error = nil
                        do { try await model.saveLanguage(value) }
                        catch { self.error = "L’enregistrement de la langue n’a pas pu être confirmé. Votre préférence précédente a été rétablie. Actualisez le profil avant de réessayer." }
                    }
                })) {
                    ForEach(AppLanguage.allCases) { Text(verbatim: $0.name).tag($0) }
                }.accessibilityIdentifier("accountLanguage").disabled(model.isSavingLanguage)
                if model.isSavingLanguage { ProgressView("Enregistrement de la langue…") }
            } header: { Text("Langue") } footer: {
                Text("Votre préférence est partagée entre le site et l’application. Le contenu de vos documents et messages reste inchangé.")
            }
            Section("Vie privée") {
                NavigationLink("Vos données dans l’application") { PrivacyView() }
                Link("Politique de confidentialité", destination: Brand.siteURL("/confidentialite/", locale: locale))
                Text("Les documents sont téléchargés à la demande. La session est conservée dans le trousseau sécurisé de cet appareil.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Besoin d’aide") {
                Link(destination: Brand.supportURL) { Label("Contacter l’assistance", systemImage: "envelope") }
                NavigationLink("À propos de Guteneo") {
                    List {
                        Wordmark().padding(.vertical)
                        Text("Préparez vos documents et retrouvez le suivi de votre atelier Guteneo.")
                        LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                        Text("Application native pour iPhone et iPad.")
                        Link("Mentions légales", destination: Brand.siteURL("/mentions-legales/", locale: locale))
                    }.paperList().navigationTitle("À propos")
                }
            }
            if let error { Section { Notice(text: error, symbol: "exclamationmark.circle") } }
            Section {
                Button("Se déconnecter") { signOutConfirmation = true }.disabled(working)
                    .accessibilityIdentifier("signOut")
            }
            Section("Suppression du compte") {
                if let request = model.accountDeletionRequest {
                    Label(LocalizedStringKey(request.status == "completed" ? "Suppression terminée" : "Demande de suppression enregistrée"), systemImage: "person.crop.circle.badge.minus")
                    Text("Demandée le \(GuteneoDate.label(request.createdAt, locale: locale))").font(.footnote)
                    if request.status != "completed" {
                        Notice(text: "Le compte n’est pas encore supprimé. Le traitement doit tenir compte des envois en cours, de votre organisation et des obligations de conservation. Une confirmation vous sera adressée après traitement.")
                    }
                } else {
                    Text("Demandez la suppression de votre compte et des données associées. Certaines preuves peuvent être conservées lorsqu’une obligation l’impose.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Button("Demander la suppression du compte", role: .destructive) { deleteConfirmation = true }
                        .disabled(working).accessibilityIdentifier("deleteAccount")
                }
            }
        }.paperList().navigationTitle(Text(verbatim: L10n.text("Compte", locale: locale)))
            .refreshable { await model.refresh() }
            .confirmationDialog("Supprimer votre compte ?", isPresented: $deleteConfirmation, titleVisibility: .visible) {
                Button("Confirmer la demande de suppression", role: .destructive) {
                    Task {
                        working = true; error = nil
                        defer { working = false }
                        do { _ = try await model.requestAccountDeletion() }
                        catch { self.error = APIError.safeMessage(for: error) }
                    }
                }
            } message: {
                Text("La demande concerne votre compte Guteneo, sur le site comme dans l’application. Elle ne rappelle pas les documents déjà envoyés. Le traitement n’est pas instantané.")
            }
            .confirmationDialog("Se déconnecter de cet appareil ?", isPresented: $signOutConfirmation, titleVisibility: .visible) {
                Button("Se déconnecter", role: .destructive) { Task { await model.signOut() } }
            }
    }
}

struct PrivacyView: View {
    @Environment(\.locale) private var locale
    var body: some View {
        List {
            Section("Compte et documents") {
                Text("Guteneo utilise votre identité et votre organisation pour vous donner accès à vos documents et à vos envois. Les PDF, destinataires et messages que vous déposez sont traités pour fournir le service.")
            }
            Section("Sur cet appareil") {
                Text("La session est stockée dans le trousseau sécurisé. Les PDF consultés restent en mémoire pendant leur lecture. L’application ne demande pas l’accès à vos contacts, à votre position, au microphone ou à la caméra.")
            }
            Section("Vos choix") {
                Text("Vous choisissez les fichiers à importer dans Fichiers. Vous pouvez vous déconnecter ou demander la suppression de votre compte depuis Compte.")
                Link("Consulter la politique complète", destination: Brand.siteURL("/confidentialite/", locale: locale))
                Link("Poser une question sur vos données", destination: Brand.supportURL)
            }
        }.paperList().navigationTitle("Vos données").navigationBarTitleDisplayMode(.inline)
    }
}
