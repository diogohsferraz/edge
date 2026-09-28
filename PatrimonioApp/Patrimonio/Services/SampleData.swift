import Foundation
import SwiftData

/// Gera uma carteira de exemplo com 18 meses de histórico para explorar o app.
@MainActor
enum SampleData {
    private struct Generator {
        var state: UInt64 = 42
        mutating func next() -> Double {
            state = state &* 6364136223846793005 &+ 1442695040888963407
            return Double(state >> 11) / Double(1 << 53)
        }
        mutating func range(_ lo: Double, _ hi: Double) -> Double { lo + (hi - lo) * next() }
    }

    static func load(into context: ModelContext, months: Int = 18) {
        var rng = Generator()
        let now = Date()

        let nubank = PortfolioStore.findOrCreateInstitution(named: "Nubank", in: context)
        let xp = PortfolioStore.findOrCreateInstitution(named: "XP Investimentos", in: context)
        let inter = PortfolioStore.findOrCreateInstitution(named: "Inter", in: context)
        let btg = PortfolioStore.findOrCreateInstitution(named: "BTG Pactual", in: context)

        struct Spec {
            let name: String
            let cls: AssetClass
            let inst: Institution
            let initial: Double
            let monthlyAporte: Double
            let meanReturn: Double
            let volatility: Double
            var indexer: String = ""
            var ticker: String = ""
            var dividendYield: Double = 0
        }

        let specs: [Spec] = [
            Spec(name: "Caixinha Reserva", cls: .conta, inst: nubank, initial: 8_000, monthlyAporte: 300, meanReturn: 0.0085, volatility: 0.0005, indexer: "100% CDI"),
            Spec(name: "CDB Liquidez Diária", cls: .rendaFixa, inst: inter, initial: 12_000, monthlyAporte: 0, meanReturn: 0.009, volatility: 0.0005, indexer: "102% CDI"),
            Spec(name: "LCI 95% CDI 2027", cls: .rendaFixa, inst: xp, initial: 20_000, monthlyAporte: 0, meanReturn: 0.0088, volatility: 0.0003, indexer: "95% CDI"),
            Spec(name: "Tesouro IPCA+ 2035", cls: .tesouro, inst: xp, initial: 15_000, monthlyAporte: 500, meanReturn: 0.008, volatility: 0.012, indexer: "IPCA + 6,5%"),
            Spec(name: "Ações - Carteira B3", cls: .acoes, inst: xp, initial: 18_000, monthlyAporte: 700, meanReturn: 0.009, volatility: 0.045, ticker: "ITUB4, WEGE3, BBAS3", dividendYield: 0.005),
            Spec(name: "FIIs", cls: .fiis, inst: btg, initial: 10_000, monthlyAporte: 400, meanReturn: 0.002, volatility: 0.02, ticker: "HGLG11, KNRI11, MXRF11", dividendYield: 0.008),
            Spec(name: "Fundo Multimercado", cls: .fundos, inst: btg, initial: 9_000, monthlyAporte: 0, meanReturn: 0.008, volatility: 0.015),
            Spec(name: "Previdência VGBL", cls: .previdencia, inst: btg, initial: 14_000, monthlyAporte: 250, meanReturn: 0.0085, volatility: 0.006),
            Spec(name: "Bitcoin", cls: .cripto, inst: nubank, initial: 3_000, monthlyAporte: 100, meanReturn: 0.02, volatility: 0.12, ticker: "BTC"),
            Spec(name: "ETF S&P 500", cls: .exterior, inst: inter, initial: 6_000, monthlyAporte: 200, meanReturn: 0.011, volatility: 0.04, ticker: "IVVB11"),
        ]

        let start = now.addingMonths(-(months - 1)).startOfMonth
        for spec in specs {
            let asset = PortfolioStore.createAsset(
                name: spec.name,
                assetClass: spec.cls,
                institution: spec.inst,
                ticker: spec.ticker,
                indexer: spec.indexer,
                maturityDate: spec.name.contains("2027") ? Calendar.app.date(from: DateComponents(year: 2027, month: 6, day: 15)) : nil,
                initialValue: spec.initial,
                initialDate: Calendar.app.date(byAdding: .day, value: 2, to: start) ?? start,
                in: context
            )
            var value = spec.initial
            for i in 0..<months {
                let month = start.addingMonths(i)
                let ret = spec.meanReturn + spec.volatility * rng.range(-1.6, 1.6)
                value *= (1 + ret)
                if i > 0 && spec.monthlyAporte > 0 {
                    let aporte = (spec.monthlyAporte * rng.range(0.6, 1.5)).rounded()
                    value += aporte
                    let day = Calendar.app.date(byAdding: .day, value: 5, to: month) ?? month
                    if day <= now {
                        PortfolioStore.recordMovement(.aporte, amount: aporte, on: day, for: asset, in: context)
                    }
                }
                if spec.dividendYield > 0 && i > 0 {
                    let provento = (value * spec.dividendYield * rng.range(0.7, 1.3) * 100).rounded() / 100
                    let day = Calendar.app.date(byAdding: .day, value: 14, to: month) ?? month
                    if day <= now {
                        PortfolioStore.recordMovement(.provento, amount: provento, on: day, for: asset, in: context)
                    }
                }
                let snapDate = min(month.endOfMonth, now)
                PortfolioStore.recordBalance((value * 100).rounded() / 100, on: snapDate, for: asset, in: context)
            }
        }

        loadTransactions(into: context, rng: &rng, now: now)
        try? context.save()
    }

    private static func loadTransactions(into context: ModelContext, rng: inout Generator, now: Date) {
        let fixed: [(CashCategory, Double, Int, String)] = [
            (.salario, 9_500, 5, "Salário"),
            (.moradia, 2_300, 10, "Aluguel"),
            (.contas, 380, 12, "Luz, água e internet"),
            (.assinaturas, 89.9, 15, "Streaming e apps"),
            (.educacao, 450, 8, "Curso de inglês"),
        ]
        let variable: [(CashCategory, ClosedRange<Double>, String)] = [
            (.mercado, 180...650, "Supermercado"),
            (.alimentacao, 45...160, "Restaurante"),
            (.transporte, 25...120, "Combustível / app"),
            (.lazer, 40...250, "Cinema e passeios"),
            (.compras, 60...400, "Compras"),
            (.saude, 50...300, "Farmácia"),
        ]
        for back in 0..<6 {
            let month = now.addingMonths(-back).startOfMonth
            for (cat, amount, day, note) in fixed {
                guard let d = Calendar.app.date(byAdding: .day, value: day - 1, to: month), d <= now else { continue }
                context.insert(CashTransaction(date: d.noon, amount: amount, category: cat, note: note))
            }
            if back % 2 == 0, let d = Calendar.app.date(byAdding: .day, value: 20, to: month), d <= now {
                context.insert(CashTransaction(date: d.noon, amount: (rng.range(600, 1800)).rounded(), category: .freelance, note: "Projeto extra"))
            }
            for _ in 0..<14 {
                let (cat, range, note) = variable[Int(rng.next() * Double(variable.count)) % variable.count]
                guard let d = Calendar.app.date(byAdding: .day, value: Int(rng.range(0, 27)), to: month), d <= now else { continue }
                let amount = (rng.range(range.lowerBound, range.upperBound) * 100).rounded() / 100
                context.insert(CashTransaction(date: d.noon, amount: amount, category: cat, note: note))
            }
        }
    }
}
