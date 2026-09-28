import Foundation
import SwiftData

/// Operações de escrita centralizadas (evita duplicar regras nas telas).
@MainActor
enum PortfolioStore {
    /// Registra o saldo de um ativo no dia. Se já existir saldo naquele dia, substitui.
    static func recordBalance(_ value: Double, on date: Date, for asset: Asset, in context: ModelContext) {
        let day = date.noon
        if let existing = asset.snapshots.first(where: { Calendar.app.isDate($0.date, inSameDayAs: day) }) {
            existing.value = value
        } else {
            let snapshot = BalanceSnapshot(date: day, value: value)
            context.insert(snapshot)
            snapshot.asset = asset
        }
    }

    static func recordMovement(_ kind: MovementKind, amount: Double, on date: Date, for asset: Asset, note: String = "", in context: ModelContext) {
        guard amount > 0 else { return }
        let movement = Movement(date: date.noon, amount: amount, kind: kind, note: note)
        context.insert(movement)
        movement.asset = asset
    }

    @discardableResult
    static func createAsset(
        name: String,
        assetClass: AssetClass,
        institution: Institution?,
        ticker: String = "",
        indexer: String = "",
        maturityDate: Date? = nil,
        notes: String = "",
        initialValue: Double? = nil,
        initialDate: Date = Date(),
        in context: ModelContext
    ) -> Asset {
        let asset = Asset(name: name, assetClass: assetClass, ticker: ticker, indexer: indexer, maturityDate: maturityDate, notes: notes)
        context.insert(asset)
        asset.institution = institution
        if let initialValue, initialValue > 0 {
            recordBalance(initialValue, on: initialDate, for: asset, in: context)
            recordMovement(.aporte, amount: initialValue, on: initialDate, for: asset, note: "Posição inicial", in: context)
        }
        return asset
    }

    static func findOrCreateInstitution(named rawName: String, in context: ModelContext) -> Institution {
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = name.normalizedKey
        let all = (try? context.fetch(FetchDescriptor<Institution>())) ?? []
        if let found = all.first(where: { $0.name.normalizedKey == key }) { return found }
        let color = InstitutionPreset.all.first(where: { $0.name.normalizedKey == key })?.colorHex ?? Palette.color(for: all.count)
        let inst = Institution(name: name.isEmpty ? "Sem instituição" : name, colorHex: color)
        context.insert(inst)
        return inst
    }

    static func deleteEverything(in context: ModelContext) {
        func wipe<T: PersistentModel>(_ type: T.Type) {
            let items = (try? context.fetch(FetchDescriptor<T>())) ?? []
            items.forEach { context.delete($0) }
        }
        wipe(BalanceSnapshot.self)
        wipe(Movement.self)
        wipe(Asset.self)
        wipe(Institution.self)
        wipe(CashTransaction.self)
        try? context.save()
    }
}

/// Instituições populares para preenchimento rápido.
struct InstitutionPreset: Identifiable {
    var id: String { name }
    let name: String
    let colorHex: String

    static let all: [InstitutionPreset] = [
        .init(name: "Nubank", colorHex: "#820AD1"),
        .init(name: "Itaú", colorHex: "#EC7000"),
        .init(name: "Bradesco", colorHex: "#CC092F"),
        .init(name: "Banco do Brasil", colorHex: "#F9C900"),
        .init(name: "Caixa", colorHex: "#005CA9"),
        .init(name: "Santander", colorHex: "#EC0000"),
        .init(name: "Inter", colorHex: "#FF7A00"),
        .init(name: "C6 Bank", colorHex: "#3A3A3C"),
        .init(name: "XP Investimentos", colorHex: "#1C1C1E"),
        .init(name: "BTG Pactual", colorHex: "#0D2B5C"),
        .init(name: "Rico", colorHex: "#FF5A00"),
        .init(name: "Clear", colorHex: "#00A3E0"),
        .init(name: "NuInvest", colorHex: "#9B4DCA"),
        .init(name: "Mercado Pago", colorHex: "#00B1EA"),
        .init(name: "PicPay", colorHex: "#21C25E"),
        .init(name: "Sicredi", colorHex: "#3FA110"),
        .init(name: "Sicoob", colorHex: "#003641"),
        .init(name: "Banco Pan", colorHex: "#00AEEF"),
        .init(name: "Órama", colorHex: "#1E9E8A"),
        .init(name: "Warren", colorHex: "#E02B57"),
        .init(name: "Avenue", colorHex: "#1D3CB5"),
        .init(name: "Binance", colorHex: "#F0B90B"),
        .init(name: "Tesouro Direto", colorHex: "#2E7D32"),
    ]
}
