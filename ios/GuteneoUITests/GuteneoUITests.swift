import XCTest
import UIKit

@MainActor
final class GuteneoUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }

    func testWelcomeExplainsSignInAndOffersNoPurchase() {
        let app = launch(arguments: ["--uitesting-signed-out"])
        XCTAssertTrue(app.buttons["signIn"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["La connexion sécurisée s’ouvre dans le navigateur système."].exists)
        let storageError = NSPredicate(format: "label == %@", "Le retrait de la session du stockage sécurisé n’a pas pu être confirmé. Déverrouillez votre appareil avant de relancer l’application.")
        XCTAssertFalse(app.staticTexts.matching(storageError).firstMatch.exists)
        for label in ["Confidentialité", "Assistance"] {
            let link = app.descendants(matching: .any).matching(NSPredicate(
                format: "label == %@ AND (elementType == %d OR elementType == %d)",
                label, XCUIElement.ElementType.button.rawValue, XCUIElement.ElementType.link.rawValue
            )).firstMatch
            XCTAssertTrue(link.waitForExistence(timeout: 5))
            XCTAssertGreaterThanOrEqual(link.frame.height, 44, "Zone tactile trop petite : \(label)")
        }
        assertLogoCount(1, in: app)
        attachScreenshot(app, name: "Accueil — déconnecté")
        assertNoPurchaseCallToAction(in: app)
    }

    func testSyntheticPDFAndPreparationCanBeReadAndClosedWithoutSending() {
        let app = launch(arguments: ["--uitesting-preview"])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        selectTab("Documents", in: app)
        let document = element("document.row.preview-document-1", in: app)
        XCTAssertTrue(document.waitForExistence(timeout: 5))
        document.tap()

        let readPDF = app.buttons["Lire le PDF original"]
        XCTAssertTrue(readPDF.waitForExistence(timeout: 5))
        readPDF.tap()
        let nativePDF = app.descendants(matching: .any).matching(identifier: "nativePDF").firstMatch
        XCTAssertTrue(nativePDF.waitForExistence(timeout: 10))
        assertLogoCount(0, in: app)
        XCUIDevice.shared.press(.home)
        let stateAfterHome = app.state
        let background = NSPredicate(format: "state == %d OR state == %d",
            XCUIApplication.State.runningBackground.rawValue,
            XCUIApplication.State.runningBackgroundSuspended.rawValue)
        let backgroundWait = XCTWaiter.wait(for: [
            XCTNSPredicateExpectation(predicate: background, object: app)
        ], timeout: 5)
        let stateAfterWait = app.state
        let diagnostic = XCTAttachment(string: "afterHome=\(stateAfterHome.rawValue); afterWait=\(stateAfterWait.rawValue); runningBackground=\(XCUIApplication.State.runningBackground.rawValue); suspended=\(XCUIApplication.State.runningBackgroundSuspended.rawValue)")
        diagnostic.name = "État réel après passage en arrière-plan"
        diagnostic.lifetime = .keepAlways
        add(diagnostic)
        XCTAssertEqual(backgroundWait, .completed, "État reçu : \(stateAfterWait.rawValue)")
        app.activate()
        XCTAssertTrue(nativePDF.waitForExistence(timeout: 10))
        assertLogoCount(0, in: app)
        attachScreenshot(app, name: "PDF synthétique — lecteur natif")
        app.buttons["Fermer"].tap()

        let prepareFax = app.buttons["Préparer un fax"]
        XCTAssertTrue(prepareFax.waitForExistence(timeout: 5))
        prepareFax.tap()
        XCTAssertTrue(app.textFields["recipient"].waitForExistence(timeout: 5))
        let prepareQuote = app.buttons["prepareQuote"]
        for _ in 0..<3 where !prepareQuote.exists {
            app.swipeUp()
        }
        XCTAssertTrue(prepareQuote.waitForExistence(timeout: 5))
        XCTAssertFalse(prepareQuote.isEnabled)
        assertLogoCount(0, in: app)
        attachScreenshot(app, name: "Préparation — aucun envoi")
        assertNoPurchaseCallToAction(in: app)
        app.buttons["Fermer"].tap()
        XCTAssertTrue(element("document.detail", in: app).waitForExistence(timeout: 5))
    }

    func testReferencePreparationHasNoApprovalAction() {
        let app = launch(arguments: ["--uitesting-preview"])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        selectTab("Envois", in: app)
        let reference = element("dispatch.row.preview-dispatch-3", in: app)
        XCTAssertTrue(reference.waitForExistence(timeout: 5))
        reference.tap()
        XCTAssertTrue(app.navigationBars["Suivi de l’envoi"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Préparation de référence"].firstMatch.waitForExistence(timeout: 5))
        let explanation = app.staticTexts.matching(NSPredicate(
            format: "label == %@",
            "Cette préparation sert uniquement à consulter le document et le devis. Elle ne peut être ni approuvée ni envoyée et ne réserve aucun montant."
        )).firstMatch
        for _ in 0..<3 where !explanation.exists { app.swipeUp() }
        XCTAssertTrue(explanation.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Ouvrir la validation sécurisée"].exists)
        XCTAssertFalse(app.staticTexts["Votre validation"].exists)
        assertNoPurchaseCallToAction(in: app)
        attachScreenshot(app, name: "Devis de référence — aucune approbation")
    }

    func testAccessibilityTextSizeKeepsAccountNavigationAvailable() {
        let app = launch(arguments: [
            "--uitesting-preview",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        attachScreenshot(app, name: "Atelier — texte accessibilité XXXL")
        assertLogoCount(1, in: app)
        selectTab("Compte", in: app)
        XCTAssertTrue(app.navigationBars["Compte"].waitForExistence(timeout: 5))
        attachScreenshot(app, name: "Compte — texte accessibilité XXXL")
        assertLogoCount(0, in: app)
        assertNoPurchaseCallToAction(in: app)
    }

    func testPreviewNavigatesDocumentsDispatchesAndAccount() {
        let app = launch(arguments: ["--uitesting-preview"])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Simulation · aucun envoi réel."].exists)
        assertLogoCount(1, in: app)
        attachScreenshot(app, name: "Atelier — simulation")
        assertNoPurchaseCallToAction(in: app)

        let openDocuments = app.buttons["atelier.openDocuments"]
        for _ in 0..<3 where !openDocuments.isHittable { app.swipeUp() }
        XCTAssertTrue(openDocuments.waitForExistence(timeout: 5))
        openDocuments.tap()
        XCTAssertTrue(element("documents.list", in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(tabElement("Documents", in: app).isSelected)
        selectTab("Atelier", in: app)
        XCTAssertTrue(app.buttons["prepareDispatch"].exists)

        selectTab("Documents", in: app)
        XCTAssertTrue(app.buttons["importPDF"].waitForExistence(timeout: 5))
        assertLogoCount(0, in: app)
        attachScreenshot(app, name: "Documents — simulation")
        assertNoPurchaseCallToAction(in: app)

        selectTab("Envois", in: app)
        XCTAssertTrue(app.navigationBars["Envois"].waitForExistence(timeout: 5))
        assertLogoCount(0, in: app)
        assertNoPurchaseCallToAction(in: app)

        selectTab("Compte", in: app)
        XCTAssertTrue(app.navigationBars["Compte"].waitForExistence(timeout: 5))
        attachScreenshot(app, name: "Compte — simulation")
        assertLogoCount(0, in: app)
        assertNoPurchaseCallToAction(in: app)

        let about = app.buttons["À propos de Guteneo"]
        for _ in 0..<3 where !about.isHittable { app.swipeUp() }
        XCTAssertTrue(about.waitForExistence(timeout: 5))
        about.tap()
        XCTAssertTrue(app.navigationBars["À propos"].waitForExistence(timeout: 5))
        assertLogoCount(1, in: app)
        attachScreenshot(app, name: "À propos — marque unique")
    }

    func testChangingSelectionReplacesDetailsAndPreservesSelectionAfterRotation() {
        let app = launch(arguments: ["--uitesting-preview"])
        defer { XCUIDevice.shared.orientation = .portrait }
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        selectTab("Documents", in: app)
        let readyRow = element("document.row.preview-document-1", in: app)
        XCTAssertTrue(readyRow.waitForExistence(timeout: 5))
        readyRow.tap()
        var detail = element("document.detail", in: app)
        XCTAssertTrue(detail.staticTexts["Dossier de souscription.pdf"].waitForExistence(timeout: 5))
        XCTAssertTrue(detail.buttons["Lire le PDF original"].exists)

        if UIDevice.current.userInterfaceIdiom == .pad {
            XCUIDevice.shared.orientation = .landscapeLeft
            waitForLayout(landscape: true, in: app)
            XCTAssertTrue(detail.staticTexts["Dossier de souscription.pdf"].waitForExistence(timeout: 5))
        }
        revealListIfCollapsed("Documents", detailTitle: "Document",
            targetRow: "document.row.preview-document-2", in: app)
        element("document.row.preview-document-2", in: app).tap()
        detail = element("document.detail", in: app)
        XCTAssertTrue(detail.staticTexts["Attestation de domicile.pdf"].waitForExistence(timeout: 5))
        XCTAssertTrue(detail.staticTexts["Vérification en cours"].firstMatch.exists)
        XCTAssertFalse(detail.staticTexts["Dossier de souscription.pdf"].exists)
        XCTAssertFalse(detail.buttons["Lire le PDF original"].exists)
        XCTAssertFalse(detail.buttons["Préparer un fax"].exists)
        assertLogoCount(0, in: app)
        attachScreenshot(app, name: "Documents — sélection remplacée")

        if UIDevice.current.userInterfaceIdiom == .pad {
            let screenCapture = XCUIScreen.main.screenshot()
            let attachment = XCTAttachment(screenshot: screenCapture)
            attachment.name = "Documents — paysage écran complet"
            attachment.lifetime = .keepAlways
            add(attachment)
            let diagnostic = XCTAttachment(string: "deviceOrientation=\(XCUIDevice.shared.orientation.rawValue); appFrame=\(app.frame); screenImageSize=\(screenCapture.image.size); screenImageOrientation=\(screenCapture.image.imageOrientation.rawValue)")
            diagnostic.name = "Géométrie réelle au moment de la capture paysage"
            diagnostic.lifetime = .keepAlways
            add(diagnostic)
            XCUIDevice.shared.orientation = .portrait
            waitForLayout(landscape: false, in: app)
            XCTAssertTrue(detail.staticTexts["Attestation de domicile.pdf"].waitForExistence(timeout: 5))
            XCTAssertFalse(detail.buttons["Lire le PDF original"].exists)
        }

        selectTab("Envois", in: app)
        let preparedRow = element("dispatch.row.preview-dispatch-2", in: app)
        XCTAssertTrue(preparedRow.waitForExistence(timeout: 5))
        preparedRow.tap()
        var dispatchDetail = element("dispatch.detail", in: app)
        let approvalSection = dispatchDetail.staticTexts["Votre validation"]
        for _ in 0..<3 where !approvalSection.exists { dispatchDetail.swipeUp() }
        XCTAssertTrue(approvalSection.waitForExistence(timeout: 5))
        revealListIfCollapsed("Envois", detailTitle: "Suivi de l’envoi",
            targetRow: "dispatch.row.preview-dispatch-1", in: app)
        element("dispatch.row.preview-dispatch-1", in: app).tap()
        dispatchDetail = element("dispatch.detail", in: app)
        XCTAssertTrue(dispatchDetail.staticTexts["Distribué"].firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(dispatchDetail.buttons["Ouvrir la validation sécurisée"].exists)
        XCTAssertFalse(dispatchDetail.staticTexts["Votre validation"].exists)
        assertNoPurchaseCallToAction(in: app)
        attachScreenshot(app, name: "Envois — actions remplacées")
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func waitForLayout(landscape: Bool, in app: XCUIApplication,
        file: StaticString = #filePath, line: UInt = #line) {
        let predicate = NSPredicate { object, _ in
            guard let application = object as? XCUIApplication else { return false }
            let frame = application.frame
            return landscape ? frame.width > frame.height : frame.height > frame.width
        }
        let result = XCTWaiter.wait(for: [
            XCTNSPredicateExpectation(predicate: predicate, object: app)
        ], timeout: 5)
        XCTAssertEqual(result, .completed, "Géométrie reçue : \(app.frame)", file: file, line: line)
    }

    private func revealListIfCollapsed(_ listTitle: String, detailTitle: String,
        targetRow: String, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        if element(targetRow, in: app).isHittable { return }
        let back = app.navigationBars[detailTitle].buttons[listTitle]
        XCTAssertTrue(back.waitForExistence(timeout: 5), "Retour natif vers \(listTitle) introuvable", file: file, line: line)
        back.tap()
        XCTAssertTrue(element(targetRow, in: app).waitForExistence(timeout: 5), file: file, line: line)
    }

    private func assertLogoCount(_ count: Int, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let logos = app.descendants(matching: .any).matching(identifier: "guteneo.logo")
        XCTAssertEqual(logos.count, count, "Nombre de signatures de marque accessibles à l’écran", file: file, line: line)
    }

    private func selectTab(_ label: String, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        tabElement(label, in: app, file: file, line: line).tap()
    }

    private func tabElement(_ label: String, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        let tabBarButton = app.tabBars.buttons[label]
        if tabBarButton.exists {
            return tabBarButton
        }
        // iPad exposes its floating tab items as cells or other accessible elements.
        let tabItem = app.descendants(matching: .any).matching(NSPredicate(
            format: "label == %@ AND (elementType == %d OR elementType == %d OR elementType == %d)",
            label,
            XCUIElement.ElementType.button.rawValue,
            XCUIElement.ElementType.cell.rawValue,
            XCUIElement.ElementType.other.rawValue
        )).firstMatch
        XCTAssertTrue(tabItem.waitForExistence(timeout: 5), "Onglet introuvable : \(label)", file: file, line: line)
        return tabItem
    }

    private func launch(arguments: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = arguments + ["-AppleLanguages", "(fr)", "-AppleLocale", "fr_FR"]
        app.launch()
        return app
    }

    private func assertNoPurchaseCallToAction(in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let forbidden = NSPredicate(
            format: "label CONTAINS[cd] %@ OR label CONTAINS[cd] %@ OR label CONTAINS[cd] %@ OR label CONTAINS[cd] %@",
            "recharger", "ajout de crédits", "acheter des crédits", "voir sur guteneo.com"
        )
        XCTAssertEqual(app.descendants(matching: .any).matching(forbidden).count, 0, file: file, line: line)
    }

    private func attachScreenshot(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
