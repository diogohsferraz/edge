import SwiftUI

/// Uma categoria do orçamento, padrão ou criada pelo usuário.
struct CategoryInfo: Identifiable, Hashable {
    let key: String
    let title: String
    let icon: String
    let colorHex: String
    let isIncome: Bool
    let parentKey: String?
    let isBuiltin: Bool

    var id: String { key }
    var color: Color { Color(hex: colorHex) }
    var isSubcategory: Bool { parentKey != nil }
}

/// Junta as categorias padrão (`CashCategory`) com as criadas pelo usuário (`CustomCategory`).
struct CategoryCatalog {
    private let custom: [CategoryInfo]
    private let byKey: [String: CategoryInfo]

    init(_ customCategories: [CustomCategory] = []) {
        let builtins = CashCategory.allCases.map(Self.info)
        var map = Dictionary(uniqueKeysWithValues: builtins.map { ($0.key, $0) })
        var list: [CategoryInfo] = []
        // Principais primeiro, para as subcategorias herdarem ícone e tipo.
        for c in customCategories.sorted(by: { ($0.parentKey == nil ? 0 : 1, $0.createdAt) < ($1.parentKey == nil ? 0 : 1, $1.createdAt) }) {
            let parent = c.parentKey.flatMap { map[$0] }
            let info = CategoryInfo(
                key: c.key,
                title: c.title,
                icon: parent?.icon ?? "tag.fill",
                colorHex: c.colorHex,
                isIncome: parent?.isIncome ?? c.isIncome,
                parentKey: parent?.key,
                isBuiltin: false
            )
            map[c.key] = info
            list.append(info)
        }
        custom = list
        byKey = map
    }

    static func info(_ c: CashCategory) -> CategoryInfo {
        CategoryInfo(key: c.rawValue, title: c.title, icon: c.icon, colorHex: c.colorHex, isIncome: c.isIncome, parentKey: nil, isBuiltin: true)
    }

    func exists(_ key: String) -> Bool { byKey[key] != nil }

    func lookup(_ key: String, isIncome: Bool? = nil) -> CategoryInfo {
        if let c = byKey[key] { return c }
        return Self.info(isIncome == true ? .outrasReceitas : .outrosGastos)
    }

    func top(isIncome: Bool) -> [CategoryInfo] {
        CashCategory.allCases.filter { $0.isIncome == isIncome }.map(Self.info) + custom.filter { $0.isIncome == isIncome && $0.parentKey == nil }
    }

    func subcategories(of key: String) -> [CategoryInfo] {
        custom.filter { $0.parentKey == key }
    }

    /// Cada categoria principal seguida das suas subcategorias.
    func flat(isIncome: Bool) -> [(info: CategoryInfo, depth: Int)] {
        top(isIncome: isIncome).flatMap { c in [(c, 0)] + subcategories(of: c.key).map { ($0, 1) } }
    }

    func root(_ key: String) -> CategoryInfo {
        let c = lookup(key)
        return c.parentKey.map { lookup($0) } ?? c
    }

    /// "Moradia › Condomínio"
    func label(_ key: String) -> String {
        let c = lookup(key)
        return c.parentKey.map { lookup($0).title + " › " + c.title } ?? c.title
    }

    /// A categoria `key` pertence ao filtro `filter` (inclui subcategorias)?
    func contains(_ key: String, in filter: String) -> Bool {
        key == filter || lookup(key).parentKey == filter
    }
}
