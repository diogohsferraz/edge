import SwiftUI

/// Classes de ativos usadas para agrupar a carteira (inspirado em Kinvo / Gorila).
enum AssetClass: String, CaseIterable, Identifiable, Codable {
    case conta
    case rendaFixa
    case tesouro
    case acoes
    case fiis
    case fundos
    case previdencia
    case cripto
    case exterior
    case outros

    var id: String { rawValue }

    var title: String {
        switch self {
        case .conta: return "Conta e Poupança"
        case .rendaFixa: return "Renda Fixa"
        case .tesouro: return "Tesouro Direto"
        case .acoes: return "Ações"
        case .fiis: return "Fundos Imobiliários"
        case .fundos: return "Fundos de Investimento"
        case .previdencia: return "Previdência"
        case .cripto: return "Criptomoedas"
        case .exterior: return "Exterior"
        case .outros: return "Outros"
        }
    }

    var examples: String {
        switch self {
        case .conta: return "Conta remunerada, poupança, caixinhas"
        case .rendaFixa: return "CDB, LCI, LCA, LC, Debêntures, CRI/CRA"
        case .tesouro: return "Selic, IPCA+, Prefixado"
        case .acoes: return "Ações da B3, ETFs"
        case .fiis: return "FIIs e Fiagros"
        case .fundos: return "Multimercado, DI, Ações"
        case .previdencia: return "PGBL, VGBL"
        case .cripto: return "Bitcoin, Ethereum, stablecoins"
        case .exterior: return "Stocks, REITs, BDRs"
        case .outros: return "Imóveis, COE, outros"
        }
    }

    var icon: String {
        switch self {
        case .conta: return "banknote"
        case .rendaFixa: return "lock.shield"
        case .tesouro: return "building.columns"
        case .acoes: return "chart.line.uptrend.xyaxis"
        case .fiis: return "building.2"
        case .fundos: return "chart.pie"
        case .previdencia: return "umbrella"
        case .cripto: return "bitcoinsign.circle"
        case .exterior: return "globe.americas"
        case .outros: return "square.grid.2x2"
        }
    }

    var colorHex: String {
        switch self {
        case .conta: return "#8E8E93"
        case .rendaFixa: return "#0A84FF"
        case .tesouro: return "#30B0C7"
        case .acoes: return "#34C759"
        case .fiis: return "#FF9F0A"
        case .fundos: return "#AF52DE"
        case .previdencia: return "#5E5CE6"
        case .cripto: return "#FFCC00"
        case .exterior: return "#FF375F"
        case .outros: return "#A2845E"
        }
    }

    var color: Color { Color(hex: colorHex) }

    /// Tenta reconhecer a classe a partir de um texto livre (usado na importação de planilhas).
    static func match(_ text: String) -> AssetClass {
        let t = text.normalizedKey
        if t.isEmpty { return .outros }
        if let exact = AssetClass(rawValue: text) { return exact }
        if let byTitle = allCases.first(where: { $0.title.normalizedKey == t }) { return byTitle }

        let rules: [(AssetClass, [String])] = [
            (.tesouro, ["tesouro", "selic", "ntn", "ltn"]),
            (.fiis, ["fii", "imobiliario", "fiagro"]),
            (.previdencia, ["previdencia", "pgbl", "vgbl"]),
            (.cripto, ["cripto", "bitcoin", "btc", "eth", "crypto"]),
            (.exterior, ["exterior", "stock", "reit", "internacional", "dolar", "usd", "bdr"]),
            (.fundos, ["fundo", "multimercado", "fic", "fim"]),
            (.rendaFixa, ["renda fixa", "cdb", "lci", "lca", "debenture", "cri", "cra", "rdb"]),
            (.acoes, ["acao", "acoes", "etf", "bolsa", "renda variavel"]),
            (.conta, ["conta", "poupanca", "caixinha", "saldo", "cofrinho"]),
        ]
        for (cls, keys) in rules where keys.contains(where: { t.contains($0.trimmingCharacters(in: .whitespaces)) }) {
            return cls
        }
        return .outros
    }
}

/// Tipo de movimentação em um ativo.
enum MovementKind: String, CaseIterable, Identifiable, Codable {
    case aporte
    case resgate
    case provento

    var id: String { rawValue }

    var title: String {
        switch self {
        case .aporte: return "Aporte"
        case .resgate: return "Resgate"
        case .provento: return "Provento"
        }
    }

    var icon: String {
        switch self {
        case .aporte: return "arrow.down.circle.fill"
        case .resgate: return "arrow.up.circle.fill"
        case .provento: return "dollarsign.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .aporte: return .green
        case .resgate: return .red
        case .provento: return .orange
        }
    }

    /// Sinal do fluxo de caixa externo da carteira (para cálculo de rentabilidade).
    /// Aporte entra (+). Resgate e provento pago saem (−).
    var externalFlowSign: Double {
        switch self {
        case .aporte: return 1
        case .resgate, .provento: return -1
        }
    }

    /// Sinal para o cálculo do "capital investido" (proventos não reduzem o capital).
    var investedSign: Double {
        switch self {
        case .aporte: return 1
        case .resgate: return -1
        case .provento: return 0
        }
    }
}
