import Foundation
import SwiftData

/// Banco, corretora, exchange ou qualquer lugar onde você guarda dinheiro.
@Model
final class Institution {
    var uid: UUID = UUID()
    var name: String = ""
    var colorHex: String = "#5E5CE6"
    var createdAt: Date = Date()

    @Relationship(deleteRule: .cascade, inverse: \Asset.institution)
    var assets: [Asset] = []

    init(name: String, colorHex: String) {
        self.name = name
        self.colorHex = colorHex
    }
}

/// Um investimento/posição (ex.: "CDB 110% CDI - Nubank").
@Model
final class Asset {
    var uid: UUID = UUID()
    var name: String = ""
    var ticker: String = ""
    var classRaw: String = AssetClass.outros.rawValue
    /// Indexador livre, ex.: "110% CDI", "IPCA + 6%", "Pré 12%".
    var indexer: String = ""
    var maturityDate: Date?
    var notes: String = ""
    var isArchived: Bool = false
    var createdAt: Date = Date()

    var institution: Institution?

    @Relationship(deleteRule: .cascade, inverse: \BalanceSnapshot.asset)
    var snapshots: [BalanceSnapshot] = []

    @Relationship(deleteRule: .cascade, inverse: \Movement.asset)
    var movements: [Movement] = []

    init(name: String, assetClass: AssetClass, ticker: String = "", indexer: String = "", maturityDate: Date? = nil, notes: String = "") {
        self.name = name
        self.classRaw = assetClass.rawValue
        self.ticker = ticker
        self.indexer = indexer
        self.maturityDate = maturityDate
        self.notes = notes
    }

    var assetClass: AssetClass {
        get { AssetClass(rawValue: classRaw) ?? .outros }
        set { classRaw = newValue.rawValue }
    }
}

/// Saldo de um ativo em uma data — equivale a uma célula da sua planilha.
@Model
final class BalanceSnapshot {
    var date: Date = Date()
    var value: Double = 0
    var asset: Asset?

    init(date: Date, value: Double) {
        self.date = date
        self.value = value
    }
}

/// Aporte, resgate ou provento em um ativo.
@Model
final class Movement {
    var date: Date = Date()
    var amount: Double = 0
    var kindRaw: String = MovementKind.aporte.rawValue
    var note: String = ""
    var asset: Asset?

    init(date: Date, amount: Double, kind: MovementKind, note: String = "") {
        self.date = date
        self.amount = amount
        self.kindRaw = kind.rawValue
        self.note = note
    }

    var kind: MovementKind {
        get { MovementKind(rawValue: kindRaw) ?? .aporte }
        set { kindRaw = newValue.rawValue }
    }
}

/// Receita ou despesa do dia a dia (controle de gastos estilo Mobills / Organizze).
@Model
final class CashTransaction {
    var date: Date = Date()
    var amount: Double = 0
    var isIncome: Bool = false
    var categoryRaw: String = CashCategory.outrosGastos.rawValue
    var note: String = ""
    /// Identificador do lançamento no extrato bancário (evita importar duas vezes).
    var ref: String = ""

    init(date: Date, amount: Double, category: CashCategory, note: String = "", ref: String = "") {
        self.date = date
        self.amount = amount
        self.isIncome = category.isIncome
        self.categoryRaw = category.rawValue
        self.note = note
        self.ref = ref
    }

    var category: CashCategory {
        get { CashCategory(rawValue: categoryRaw) ?? (isIncome ? .outrasReceitas : .outrosGastos) }
        set {
            categoryRaw = newValue.rawValue
            isIncome = newValue.isIncome
        }
    }
}

// MARK: - Conveniências

extension Asset {
    var sortedSnapshots: [BalanceSnapshot] { snapshots.sorted { $0.date < $1.date } }
    var sortedMovements: [Movement] { movements.sorted { $0.date < $1.date } }

    var currentValue: Double { sortedSnapshots.last?.value ?? 0 }
    var lastUpdate: Date? { snapshots.map(\.date).max() }

    /// Aportes − resgates.
    var investedAmount: Double { movements.reduce(0) { $0 + $1.amount * $1.kind.investedSign } }
    var totalProventos: Double { movements.filter { $0.kind == .provento }.reduce(0) { $0 + $1.amount } }

    /// Ganho = saldo atual − capital investido + proventos recebidos.
    var totalGain: Double { currentValue - investedAmount + totalProventos }

    var gainPercent: Double? {
        investedAmount > 0 ? totalGain / investedAmount : nil
    }

    var institutionName: String { institution?.name ?? "Sem instituição" }

    var analyticsInput: AssetInput {
        AssetInput(
            id: uid,
            name: name,
            assetClass: assetClass,
            institutionName: institutionName,
            institutionColorHex: institution?.colorHex ?? "#8E8E93",
            snapshots: sortedSnapshots.map { ValuePoint(date: $0.date, value: $0.value) },
            flows: sortedMovements.map { FlowInput(date: $0.date, kind: $0.kind, amount: $0.amount) }
        )
    }
}

extension Institution {
    var activeAssets: [Asset] { assets.filter { !$0.isArchived } }
    var totalValue: Double { assets.reduce(0) { $0 + $1.currentValue } }
}
