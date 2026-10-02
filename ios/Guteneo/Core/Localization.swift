import Foundation

enum AppLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
    case fr, en, de, lb
    var id: String { rawValue }
    var name: String {
        switch self {
        case .fr: "Français"
        case .en: "English"
        case .de: "Deutsch"
        case .lb: "Lëtzebuergesch"
        }
    }
    var locale: Locale {
        Locale(identifier: ["fr": "fr_FR", "en": "en_GB", "de": "de_DE", "lb": "lb_LU"][rawValue]!)
    }
    static func resolve(_ preferences: [String]) -> AppLanguage {
        preferences.lazy.compactMap { tag in
            AppLanguage(rawValue: tag.replacingOccurrences(of: "_", with: "-").split(separator: "-").first.map(String.init)?.lowercased() ?? "")
        }.first ?? .fr
    }
}

/// Uses explicit bundles for Foundation/UIKit strings; SwiftUI uses the same
/// language through its locale environment. Never rewrite document/user content.
enum L10n {
    static func text(_ key: String, locale: Locale) -> String {
        let language = AppLanguage.resolve([locale.identifier])
        guard let path = Bundle.main.path(forResource: language.rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else { return key }
        return bundle.localizedString(forKey: key, value: key, table: "Localizable")
    }
    static func pages(_ count: Int, locale: Locale) -> String {
        let key = count == 1 ? "%@ page" : "%@ pages"
        return text(key, locale: locale).replacingOccurrences(of: "%@", with: count.formatted(.number.locale(locale)))
    }
}
