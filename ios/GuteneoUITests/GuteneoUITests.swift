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
        attachScreenshot(app, name: "Accueil — déconnecté")
        assertNoPurchaseCallToAction(in: app)
    }

    func testSyntheticPDFAndPreparationCanBeReadAndClosedWithoutSending() {
        let app = launch(arguments: ["--uitesting-preview"])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Documents"].tap()
        let document = app.staticTexts["Dossier de souscription.pdf"].firstMatch
        XCTAssertTrue(document.waitForExistence(timeout: 5))
        document.tap()

        let readPDF = app.buttons["Lire le PDF original"]
        XCTAssertTrue(readPDF.waitForExistence(timeout: 5))
        readPDF.tap()
        let nativePDF = app.descendants(matching: .any).matching(identifier: "nativePDF").firstMatch
        XCTAssertTrue(nativePDF.waitForExistence(timeout: 10))
        XCUIDevice.shared.press(.home)
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5))
        app.activate()
        XCTAssertTrue(nativePDF.waitForExistence(timeout: 10))
        attachScreenshot(app, name: "PDF synthétique — lecteur natif")
        app.buttons["Fermer"].tap()

        let prepareFax = app.buttons["Préparer un fax"]
        XCTAssertTrue(prepareFax.waitForExistence(timeout: 5))
        prepareFax.tap()
        XCTAssertTrue(app.textFields["recipient"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["prepareQuote"].isEnabled)
        attachScreenshot(app, name: "Préparation — aucun envoi")
        assertNoPurchaseCallToAction(in: app)
        app.buttons["Fermer"].tap()
        XCTAssertTrue(app.navigationBars["Document"].waitForExistence(timeout: 5))
    }

    func testAccessibilityTextSizeKeepsAccountNavigationAvailable() {
        let app = launch(arguments: [
            "--uitesting-preview",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        attachScreenshot(app, name: "Atelier — texte accessibilité XXXL")
        app.tabBars.buttons["Compte"].tap()
        XCTAssertTrue(app.navigationBars["Compte"].waitForExistence(timeout: 5))
        attachScreenshot(app, name: "Compte — texte accessibilité XXXL")
        assertNoPurchaseCallToAction(in: app)
    }

    func testPreviewNavigatesDocumentsDispatchesAndAccount() {
        let app = launch(arguments: ["--uitesting-preview"])
        XCTAssertTrue(app.buttons["prepareDispatch"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Simulation · aucun envoi réel."].exists)
        attachScreenshot(app, name: "Atelier — simulation")
        assertNoPurchaseCallToAction(in: app)

        app.tabBars.buttons["Documents"].tap()
        XCTAssertTrue(app.buttons["importPDF"].waitForExistence(timeout: 5))
        attachScreenshot(app, name: "Documents — simulation")
        assertNoPurchaseCallToAction(in: app)

        app.tabBars.buttons["Envois"].tap()
        XCTAssertTrue(app.navigationBars["Envois"].waitForExistence(timeout: 5))
        assertNoPurchaseCallToAction(in: app)

        app.tabBars.buttons["Compte"].tap()
        XCTAssertTrue(app.navigationBars["Compte"].waitForExistence(timeout: 5))
        attachScreenshot(app, name: "Compte — simulation")
        assertNoPurchaseCallToAction(in: app)
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
