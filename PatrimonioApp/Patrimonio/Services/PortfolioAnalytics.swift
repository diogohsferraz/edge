import Foundation

// Tipos de valor independentes do SwiftData, para que os cálculos sejam simples de testar.

struct ValuePoint: Hashable {
    let date: Date
    let value: Double
}

struct FlowInput: Hashable {
    let date: Date
    let kind: MovementKind
    let amount: Double
}

struct AssetInput: Identifiable {
    let id: UUID
    let name: String
    let assetClass: AssetClass
    let institutionName: String
    let institutionColorHex: String
    /// Ordenados por data crescente.
    let snapshots: [ValuePoint]
    /// Ordenados por data crescente.
    let flows: [FlowInput]
}

struct EvolutionPoint: Identifiable {
    var id: Date { month }
    /// Início do mês.
    let month: Date
    let total: Double
    /// Capital investido acumulado (aportes − resgates).
    let invested: Double
    let byClass: [AssetClass: Double]
}

struct MonthPerformance: Identifiable {
    var id: Date { month }
    let month: Date
    let startValue: Double
    let endValue: Double
    let aportes: Double
    let resgates: Double
    let proventos: Double
    /// Resultado financeiro do mês: variação do saldo descontados os fluxos.
    let gain: Double
    /// Rentabilidade pelo método Modified Dietz. `nil` quando não há base para calcular.
    let returnRate: Double?

    var netContribution: Double { aportes - resgates }
}

struct AllocationSlice: Identifiable {
    var id: String { label }
    let label: String
    let colorHex: String
    let value: Double
    let share: Double
}

struct CumulativePoint: Identifiable {
    var id: String { "\(series)-\(month.timeIntervalSince1970)" }
    let month: Date
    let series: String
    let value: Double
}

struct PortfolioAnalytics {
    let assets: [AssetInput]

    init(assets: [AssetInput]) {
        self.assets = assets
    }

    // MARK: Valores pontuais

    /// Saldo do ativo na data (último saldo informado até ela, inclusive).
    func value(of asset: AssetInput, asOf date: Date) -> Double {
        var result = 0.0
        for s in asset.snapshots {
            if s.date <= date { result = s.value } else { break }
        }
        return result
    }

    func totalValue(asOf date: Date = Date().endOfDay) -> Double {
        assets.reduce(0) { $0 + value(of: $1, asOf: date) }
    }

    func invested(asOf date: Date = Date().endOfDay) -> Double {
        assets.reduce(0) { acc, a in
            acc + a.flows.filter { $0.date <= date }.reduce(0) { $0 + $1.amount * $1.kind.investedSign }
        }
    }

    func proventos(from start: Date = .distantPast, to end: Date = Date().endOfDay) -> Double {
        assets.reduce(0) { acc, a in
            acc + a.flows.filter { $0.kind == .provento && $0.date >= start && $0.date <= end }.reduce(0) { $0 + $1.amount }
        }
    }

    var firstDate: Date? {
        let dates = assets.flatMap { $0.snapshots.map(\.date) + $0.flows.map(\.date) }
        return dates.min()
    }

    /// Lista de inícios de mês entre duas datas (inclusive).
    func months(from start: Date, to end: Date) -> [Date] {
        var result: [Date] = []
        var m = start.startOfMonth
        let last = end.startOfMonth
        while m <= last {
            result.append(m)
            m = m.addingMonths(1)
        }
        return result
    }

    /// Meses exibidos: os `limit` últimos meses (ou todos, se `nil`) desde o primeiro registro.
    func displayMonths(limit: Int?, now: Date = Date()) -> [Date] {
        guard let first = firstDate else { return [] }
        let all = months(from: first, to: now)
        if let limit, all.count > limit { return Array(all.suffix(limit)) }
        return all
    }

    // MARK: Séries

    func evolution(limit: Int?, now: Date = Date()) -> [EvolutionPoint] {
        displayMonths(limit: limit, now: now).map { month in
            let cutoff = min(month.endOfMonth, now.endOfDay)
            var byClass: [AssetClass: Double] = [:]
            var total = 0.0
            for a in assets {
                let v = value(of: a, asOf: cutoff)
                total += v
                byClass[a.assetClass, default: 0] += v
            }
            return EvolutionPoint(month: month, total: total, invested: invested(asOf: cutoff), byClass: byClass)
        }
    }

    func performance(limit: Int?, now: Date = Date()) -> [MonthPerformance] {
        displayMonths(limit: limit, now: now).map { performance(for: $0, now: now) }
    }

    func performance(for month: Date, now: Date = Date()) -> MonthPerformance {
        let start = month.startOfMonth
        let next = month.startOfNextMonth
        let cutoff = min(next.addingTimeInterval(-1), now.endOfDay)
        let startValue = totalValue(asOf: start.addingTimeInterval(-1))
        let endValue = totalValue(asOf: cutoff)

        let periodLength = max(next.timeIntervalSince(start), 1)
        var aportes = 0.0, resgates = 0.0, proventos = 0.0
        var netFlow = 0.0
        var weightedFlow = 0.0

        for a in assets {
            for f in a.flows where f.date >= start && f.date < next {
                switch f.kind {
                case .aporte: aportes += f.amount
                case .resgate: resgates += f.amount
                case .provento: proventos += f.amount
                }
                let signed = f.amount * f.kind.externalFlowSign
                netFlow += signed
                // Peso = fração do mês em que o dinheiro ficou aplicado.
                let weight = max(0, min(1, next.timeIntervalSince(f.date) / periodLength))
                weightedFlow += signed * weight
            }
        }

        let gain = endValue - startValue - netFlow
        let base = startValue + weightedFlow
        let rate: Double? = base > 0.01 ? gain / base : nil

        return MonthPerformance(
            month: start,
            startValue: startValue,
            endValue: endValue,
            aportes: aportes,
            resgates: resgates,
            proventos: proventos,
            gain: gain,
            returnRate: rate
        )
    }

    /// Rentabilidade acumulada (juros compostos) da carteira mês a mês.
    static func cumulative(_ rates: [(Date, Double?)], series: String) -> [CumulativePoint] {
        var acc = 1.0
        var points: [CumulativePoint] = []
        for (month, r) in rates {
            guard let r else { continue }
            acc *= (1 + r)
            points.append(CumulativePoint(month: month, series: series, value: acc - 1))
        }
        return points
    }

    // MARK: Alocação

    func allocationByClass(asOf date: Date = Date().endOfDay) -> [AllocationSlice] {
        var totals: [AssetClass: Double] = [:]
        for a in assets { totals[a.assetClass, default: 0] += value(of: a, asOf: date) }
        return Self.slices(totals.map { ($0.key.title, $0.key.colorHex, $0.value) })
    }

    func allocationByInstitution(asOf date: Date = Date().endOfDay) -> [AllocationSlice] {
        var totals: [String: (String, Double)] = [:]
        for a in assets {
            let current = totals[a.institutionName] ?? (a.institutionColorHex, 0)
            totals[a.institutionName] = (current.0, current.1 + value(of: a, asOf: date))
        }
        return Self.slices(totals.map { ($0.key, $0.value.0, $0.value.1) })
    }

    private static func slices(_ raw: [(String, String, Double)]) -> [AllocationSlice] {
        let positive = raw.filter { $0.2 > 0.004 }
        let total = positive.reduce(0) { $0 + $1.2 }
        guard total > 0 else { return [] }
        return positive
            .map { AllocationSlice(label: $0.0, colorHex: $0.1, value: $0.2, share: $0.2 / total) }
            .sorted { $0.value > $1.value }
    }

    // MARK: Projeção de meta

    /// Número de meses estimado para atingir `goal`, dado aporte e rentabilidade mensais médios.
    static func monthsToReach(goal: Double, current: Double, monthlyContribution: Double, monthlyRate: Double, maxMonths: Int = 600) -> Int? {
        if current >= goal { return 0 }
        var v = current
        for m in 1...maxMonths {
            v = v * (1 + monthlyRate) + monthlyContribution
            if v >= goal { return m }
        }
        return nil
    }
}
