import SwiftUI

/// Categorias de receitas e despesas.
enum CashCategory: String, CaseIterable, Identifiable, Codable {
    // Receitas
    case salario
    case freelance
    case rendimentos
    case outrasReceitas
    // Despesas
    case moradia
    case mercado
    case alimentacao
    case transporte
    case saude
    case educacao
    case lazer
    case compras
    case assinaturas
    case contas
    case viagem
    case cartao
    case impostos
    case pets
    case outrosGastos

    var id: String { rawValue }

    static var incomeCases: [CashCategory] { allCases.filter(\.isIncome) }
    static var expenseCases: [CashCategory] { allCases.filter { !$0.isIncome } }

    var isIncome: Bool {
        switch self {
        case .salario, .freelance, .rendimentos, .outrasReceitas: return true
        default: return false
        }
    }

    var title: String {
        switch self {
        case .salario: return "Salário"
        case .freelance: return "Freelance / Extra"
        case .rendimentos: return "Rendimentos"
        case .outrasReceitas: return "Outras receitas"
        case .moradia: return "Moradia"
        case .mercado: return "Mercado"
        case .alimentacao: return "Restaurantes"
        case .transporte: return "Transporte"
        case .saude: return "Saúde"
        case .educacao: return "Educação"
        case .lazer: return "Lazer"
        case .compras: return "Compras"
        case .assinaturas: return "Assinaturas"
        case .contas: return "Contas da casa"
        case .viagem: return "Viagem"
        case .cartao: return "Fatura do cartão"
        case .impostos: return "Impostos e taxas"
        case .pets: return "Pets"
        case .outrosGastos: return "Outros gastos"
        }
    }

    var icon: String {
        switch self {
        case .salario: return "briefcase.fill"
        case .freelance: return "hammer.fill"
        case .rendimentos: return "chart.line.uptrend.xyaxis"
        case .outrasReceitas: return "plus.circle.fill"
        case .moradia: return "house.fill"
        case .mercado: return "cart.fill"
        case .alimentacao: return "fork.knife"
        case .transporte: return "car.fill"
        case .saude: return "cross.case.fill"
        case .educacao: return "book.fill"
        case .lazer: return "gamecontroller.fill"
        case .compras: return "bag.fill"
        case .assinaturas: return "play.rectangle.fill"
        case .contas: return "bolt.fill"
        case .viagem: return "airplane"
        case .cartao: return "creditcard.fill"
        case .impostos: return "doc.text.fill"
        case .pets: return "pawprint.fill"
        case .outrosGastos: return "ellipsis.circle.fill"
        }
    }

    var colorHex: String {
        switch self {
        case .salario: return "#34C759"
        case .freelance: return "#30D158"
        case .rendimentos: return "#00C7BE"
        case .outrasReceitas: return "#64D2FF"
        case .moradia: return "#0A84FF"
        case .mercado: return "#FF9F0A"
        case .alimentacao: return "#FF6B35"
        case .transporte: return "#5E5CE6"
        case .saude: return "#FF375F"
        case .educacao: return "#BF5AF2"
        case .lazer: return "#FFD60A"
        case .compras: return "#FF2D55"
        case .assinaturas: return "#AC8E68"
        case .contas: return "#30B0C7"
        case .viagem: return "#66D4CF"
        case .cartao: return "#3A3A3C"
        case .impostos: return "#8E8E93"
        case .pets: return "#A2845E"
        case .outrosGastos: return "#636366"
        }
    }

    var color: Color { Color(hex: colorHex) }
}
