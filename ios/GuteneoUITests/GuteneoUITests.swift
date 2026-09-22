import XCTest

@MainActor
final class GuteneoUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testWelcomeExplainsSignInAndOffersNoPurchase() {
        let app = launch(arguments: ["--uitesting-signed-out"])
        XCTAssertTrue(app.buttons["signIn"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["La connexion sécurisée s’ouvre dans le navigateur système."].exists)
        let storageError = NSPredicate(format: "label == %@", "Le retrait de la session du stockage sécurisé n’a pas pu être confirmé. Déverrouillez votre appareil avant de relancer l’application.")
        XCTAssertFalse(app.staticTexts.matching(storageError).firstMatch.exists)
        assertLogoCount(1, in: app)
        attachScreenshot(app, name: "Accueil — déconnecté")
        assertNoPurchaseCallToAction(in: app)
    }

    func testSyntheticPDFAndPreparationCanBeReadAndClosedWithoutSending() {
        let app = launch(arguments: ["--uitesting-preview"])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        selectTab("Documents", in: app)
        let document = app.staticTexts["Dossier de souscription.pdf"].firstMatch
        XCTAssertTrue(document.waitForExistence(timeout: 5))
        document.tap()

        let readPDF = app.buttons["Lire le PDF original"]
        XCTAssertTrue(readPDF.waitForExistence(timeout: 5))
        readPDF.tap()
        let nativePDF = app.descendants(matching: .any).matching(identifier: "nativePDF").firstMatch
        XCTAssertTrue(nativePDF.waitForExistence(timeout: 10))
        assertLogoCount(0, in: app)
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5))
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
        XCTAssertTrue(app.navigationBars["Document"].waitForExistence(timeout: 5))
    }

    func testReferencePreparationHasNoApprovalAction() {
        let app = launch(arguments: ["--uitesting-preview"])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        selectTab("Envois", in: app)
        let reference = app.staticTexts["+33 1 00 00 00 02"].firstMatch
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

    private func assertLogoCount(_ count: Int, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let logos = app.descendants(matching: .any).matching(identifier: "guteneo.logo")
        XCTAssertEqual(logos.count, count, "Nombre de signatures de marque accessibles à l’écran", file: file, line: line)
    }

    private func selectTab(_ label: String, in app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let tabBarButton = app.tabBars.buttons[label]
        if tabBarButton.exists {
            tabBarButton.tap()
            return
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
        tabItem.tap()
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
