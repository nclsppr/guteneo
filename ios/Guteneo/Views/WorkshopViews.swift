import SwiftUI

/// Editorial artwork is content, separate from the sole Guteneo signature.
struct PrintWorkshopArtwork: View {
    var height: CGFloat = 260
    var body: some View {
        Image("PrintWorkshop")
            .resizable().scaledToFit()
            .frame(maxWidth: .infinity).frame(height: height)
            .accessibilityHidden(true)
            .allowsHitTesting(false)
    }
}

private struct PaperRule: View {
    var body: some View {
        GeometryReader { geometry in
            Path { path in
                path.move(to: CGPoint(x: 0, y: 1))
                path.addLine(to: CGPoint(x: geometry.size.width, y: 1))
            }
            .stroke(Brand.ink.opacity(0.22), style: StrokeStyle(lineWidth: 1, dash: [2, 5]))
        }
        .frame(height: 2)
        .accessibilityHidden(true)
    }
}

struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                let wide = sizeClass == .regular && geometry.size.width >= 800 && !typeSize.isAccessibilitySize
                ScrollView {
                    VStack(alignment: .leading, spacing: wide ? 36 : 24) {
                        HStack(alignment: .center, spacing: 16) {
                            Wordmark()
                                .opacity(model.isWorking ? 0 : 1)
                                .accessibilityHidden(model.isWorking)
                            Spacer(minLength: 0)
                            Picker("Language", selection: Binding(get: { model.language }, set: { language in
                                model.chooseWelcomeLanguage(language)
                            })) {
                                ForEach(AppLanguage.allCases) { Text(verbatim: $0.name).tag($0) }
                            }
                            .pickerStyle(.menu).accessibilityIdentifier("welcomeLanguage")
                            .disabled(model.isWorking)
                        }
                        if wide {
                            HStack(alignment: .center, spacing: 48) {
                                welcomeCopy.frame(maxWidth: 480, alignment: .leading)
                                PrintWorkshopArtwork(height: 380)
                            }
                            PaperRule()
                            HStack(alignment: .top, spacing: 40) {
                                principle("Your documents, unchanged", symbol: "doc.text")
                                principle("You control every dispatch", symbol: "checkmark.shield")
                                principle("Tracking shared with your workspace", symbol: "clock.arrow.circlepath")
                            }
                        } else {
                            welcomeCopy
                            if !typeSize.isAccessibilitySize { PrintWorkshopArtwork(height: 150) }
                        }
                        HStack(spacing: 24) {
                            Link(destination: Brand.siteURL("/privacy/", locale: model.language.locale)) { Text("Privacy").frame(minHeight: 44) }
                            Link(destination: Brand.supportURL) { Text("Support").frame(minHeight: 44) }
                        }.font(.footnote)
                    }
                    .frame(maxWidth: 1120, alignment: .leading)
                    .padding(wide ? 40 : 24)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: wide ? geometry.size.height : nil, alignment: .center)
                }
                .background(Brand.paper)
            }
        }
    }

    private var welcomeCopy: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("Your workspace,\nwithin reach.")
                .font(.system(.largeTitle, design: .serif)).foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Find your PDFs, prepare dispatches and track their progress.")
                .font(.title3).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let error = model.errorMessage {
                Notice(text: error, symbol: "exclamationmark.circle")
            }
            if model.phase == .expired {
                Notice(text: "Your session has expired. Sign in again to return to your workspace.")
            }
            Button {
                Task { await model.signIn() }
            } label: {
                HStack {
                    Text("Sign in").fontWeight(.semibold)
                    Spacer()
                    if model.isWorking { ProgressView() }
                    else { Image(systemName: "arrow.right") }
                }.padding(.vertical, 9).foregroundStyle(Brand.paper)
            }
            .buttonStyle(.borderedProminent).disabled(model.isWorking)
            .accessibilityIdentifier("signIn")
            Text("Secure sign-in opens in the system browser.")
                .font(.footnote).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func principle(_ title: String, symbol: String) -> some View {
        Label(LocalizedStringKey(title), systemImage: symbol).font(.subheadline)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct OverviewView: View {
    @Environment(\.locale) private var locale
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize
    @Binding var composing: Bool
    let openDocuments: () -> Void
    var body: some View {
        GeometryReader { geometry in
            let wide = sizeClass == .regular && geometry.size.width >= 800 && !typeSize.isAccessibilitySize
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    introduction(wide: wide)
                    if model.session?.simulation == true {
                        Notice(text: "Simulation · no real dispatches.", symbol: "testtube.2")
                    }
                    if let error = model.errorMessage {
                        VStack(alignment: .leading, spacing: 8) {
                            Notice(text: error, symbol: "exclamationmark.circle")
                            Button("Try again") { Task { await model.refresh() } }
                        }
                    }
                    if wide {
                        HStack(alignment: .top, spacing: 40) {
                            recentDispatches.frame(maxWidth: .infinity, alignment: .topLeading)
                            recentDocuments.frame(maxWidth: .infinity, alignment: .topLeading)
                        }
                    } else {
                        recentDispatches
                        recentDocuments
                    }
                    workflow(wide: wide)
                }
                .frame(maxWidth: 1200, alignment: .leading)
                .padding(wide ? 32 : 20)
                .frame(maxWidth: .infinity)
            }
            .background(Brand.paper)
            .refreshable { await model.refresh() }
            .overlay { if model.isLoading && model.dispatches.isEmpty { ProgressView() } }
        }
        .navigationTitle("Workspace")
    }

    private func introduction(wide: Bool) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            if wide {
                HStack(alignment: .center, spacing: 36) {
                    introductionCopy.frame(maxWidth: .infinity, alignment: .leading)
                    PrintWorkshopArtwork(height: 270).frame(maxWidth: .infinity)
                }
            } else {
                introductionCopy
            }
            PaperRule()
        }
    }

    private var introductionCopy: some View {
        VStack(alignment: .leading, spacing: 16) {
            Wordmark()
            Text("The right document.\nThe right recipient.")
                .font(.system(.title, design: .serif)).foregroundStyle(Brand.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(verbatim: model.session?.organization.name ?? L10n.text("Your workspace", locale: locale))
                .foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Button { composing = true } label: {
                Label("Prepare a dispatch", systemImage: "plus")
                    .fontWeight(.semibold).padding(.vertical, 7).foregroundStyle(Brand.paper)
            }
            .buttonStyle(.borderedProminent)
            .disabled(model.session?.canPrepare != true)
            .accessibilityIdentifier("prepareDispatch")
        }
    }

    private var recentDispatches: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Recent dispatches").font(.system(.title2, design: .serif))
            if model.dispatches.isEmpty {
                ContentUnavailableView("No dispatches yet", systemImage: "paperplane",
                    description: Text("Start by importing a PDF or preparing a message."))
                    .frame(maxWidth: .infinity)
            } else {
                VStack(spacing: 0) {
                    ForEach(model.dispatches.prefix(5)) { dispatch in
                        NavigationLink { DispatchDetailView(id: dispatch.id) } label: {
                            workshopRow { DispatchRow(dispatch: dispatch) }
                        }
                        .buttonStyle(.plain)
                        if dispatch.id != model.dispatches.prefix(5).last?.id { Divider() }
                    }
                }
            }
        }
    }

    private var recentDocuments: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Close at hand").font(.system(.title2, design: .serif))
            if model.documents.isEmpty {
                Label("Your PDFs will find their place here.", systemImage: "doc.on.doc")
                    .foregroundStyle(.secondary).padding(.vertical, 20)
            } else {
                VStack(spacing: 0) {
                    ForEach(model.documents.prefix(3)) { document in
                        NavigationLink { DocumentDetailView(id: document.id) } label: {
                            workshopRow { DocumentRow(document: document) }
                        }
                        .buttonStyle(.plain)
                        if document.id != model.documents.prefix(3).last?.id { Divider() }
                    }
                }
            }
            Button(action: openDocuments) {
                Label("All documents", systemImage: "arrow.right")
                    .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
            }
            .accessibilityIdentifier("atelier.openDocuments")
            Notice(text: "The original PDF is preserved. It is verified before use.", symbol: "lock.doc")
        }
    }

    private func workshopRow<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 16) {
            content().frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary).accessibilityHidden(true)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    private func workflow(wide: Bool) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            PaperRule()
            Text("Every dispatch under your control.")
                .font(.system(.title3, design: .serif)).foregroundStyle(Brand.ink)
            let layout = wide ? AnyLayout(HStackLayout(alignment: .top, spacing: 30)) : AnyLayout(VStackLayout(alignment: .leading, spacing: 16))
            layout {
                workflowStep("Prepare", detail: "A PDF and its recipient.", symbol: "doc.badge.plus")
                workflowStep("Review", detail: "The content, options and quote.", symbol: "doc.text.magnifyingglass")
                workflowStep("Approve", detail: "Personally, in your secure workspace.", symbol: "checkmark.shield")
            }
        }
    }

    private func workflowStep(_ title: String, detail: String, symbol: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol).font(.title3).foregroundStyle(Brand.cobalt)
                .frame(width: 26).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 5) {
                Text(LocalizedStringKey(title)).font(.subheadline.weight(.semibold))
                Text(LocalizedStringKey(detail)).font(.footnote).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
