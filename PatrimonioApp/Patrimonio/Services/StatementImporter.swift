import Foundation
import SwiftData

/// Importa extratos bancários (CSV) para o Orçamento.
/// Testado com o extrato de conta corrente do Banco do Brasil:
/// `"Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"`.
enum StatementImporter {
    struct Row: Identifiable, Equatable {
        let id: Int
        let date: Date
        let title: String
        let details: String
        let note: String
        let amount: Double
        let isIncome: Bool
        let isInvestment: Bool
        let ref: String
        var category: CashCategory
        /// Categoria personalizada escolhida (sobrepõe `category`).
        var customKey: String?
        var include: Bool
        var isDuplicate = false
        var isRemembered = false
        /// Pagamento de fatura desmarcado porque as faturas do cartão são importadas detalhadas.
        var isCardPayment = false

        /// Chave gravada no lançamento (padrão ou personalizada).
        var categoryKey: String {
            get { customKey ?? category.rawValue }
            set {
                if let c = CashCategory(rawValue: newValue) { category = c; customKey = nil } else { customKey = newValue }
            }
        }
    }

    /// Depois de importar uma fatura detalhada, o pagamento da fatura na conta vira transferência.
    static var cardItemized: Bool {
        get { UserDefaults.standard.bool(forKey: "statement.cardItemized") }
        set { UserDefaults.standard.set(newValue, forKey: "statement.cardItemized") }
    }

    struct Parsed {
        var rows: [Row]
        var skippedBalance = 0
        var skippedInvestment = 0
        var invalid = 0
    }

    enum ParseError: LocalizedError {
        case empty
        case missingColumns

        var errorDescription: String? {
            switch self {
            case .empty: return "O extrato está vazio."
            case .missingColumns: return "Não reconheci as colunas do extrato. É preciso ter Data, Lançamento/Descrição e Valor."
            }
        }
    }

    private enum Column: CaseIterable {
        case date, title, details, doc, amount, type
    }

    private static let aliases: [Column: [String]] = [
        .date: ["data", "data lancamento", "data do lancamento", "date"],
        .title: ["lancamento", "historico", "descricao", "title", "estabelecimento"],
        .details: ["detalhes", "complemento", "observacao"],
        .doc: ["n documento", "no documento", "n° documento", "documento", "numero documento", "identificador"],
        .amount: ["valor", "valor (r$)", "amount", "valor r$"],
        .type: ["tipo lancamento", "tipo", "tipo de lancamento"],
    ]

    private static let balanceTitles: Set<String> = ["saldo", "saldo anterior", "saldo do dia", "saldo atual", "saldo final", "s a l d o", "saldo disponivel"]

    /// Movimentações entre a conta e investimentos: não são receita nem despesa.
    private static let investmentKeys = ["rende facil", "poupanca", "aplicacao", "resgate", "tesouro dir", "cdb", "lci", "lca", "fundo", "invest", "corretora", "previdencia", "bb acoes", "renda fixa"]

    static func isStatement(header: [String]) -> Bool {
        let h = header.map(\.normalizedKey)
        func has(_ c: Column) -> Bool { h.contains { aliases[c]!.contains($0) } }
        return has(.date) && has(.amount) && has(.title) && !h.contains("ativo") && !h.contains("investimento")
    }

    // MARK: - Categorias

    private static let incomeRules: [(CashCategory, [String])] = [
        (.salario, ["proventos", "salario", "pagamento de salario", "folha", "vencimento", "remuneracao"]),
        (.rendimentos, ["rendimento", "juros", "dividendo", "amortizacao"]),
        (.freelance, ["honorario", "servico prestado"]),
    ]

    private static let expenseRules: [(CashCategory, [String])] = [
        (.cartao, ["cartao credito", "cartao de credito", "pagto cartao", "fatura"]),
        (.impostos, ["imposto", "darf", "iptu", "ipva", "tributo", "receita federal", "taxa", "anuidade", "anud", "tarifa", "iof ", "encargo"]),
        (.moradia, ["edificio", "condominio", "aluguel", "residencial", "imobiliaria", "res ", "leroy", "madebras", "home ", "moveis", "decor", "construc"]),
        (.contas, ["energia", "equatorial", "neoenergia", "enel", "cemig", "light", "agua", "casal", "sabesp", "internet", "claro", "vivo", "tim ", "oi ", "net ", "gas "]),
        (.transporte, ["posto", "combust", "shell", "ipiranga", "uber", "99 ", "99app", "estacion", "pedagio", "sem parar", "detran"]),
        (.compras, ["magazine", "americanas", "shopee", "mercadolivre", "mercadoliv", "mercado livre", "amazon", "shein", "renner", "riachuelo", "marisa", "netshoes", "cellshop"]),
        (.mercado, ["supermerc", "mercado", "atacad", "assai", "carrefour", "hortifruti", "padaria", "extra ", "pao de acucar", "sams club", "acougue", "unicompra"]),
        (.alimentacao, ["restaurante", "ifood", "lanche", "burger", "pizza", "bar ", "cafe"]),
        (.saude, ["farmacia", "drogaria", "drogasil", "pague menos", "hospital", "clinica", "laborat", "unilab", "unimed", "hapvida", "smartfit", "academia", "odonto", "medic"]),
        (.educacao, ["escola", "colegio", "coleg", "faculdade", "curso", "livraria", "udemy"]),
        (.assinaturas, ["netflix", "spotify", "amazon prime", "disney", "youtube", "apple.com", "google", "hbo", "globoplay"]),
        (.viagem, ["hotel", "hot ", "pousada", "airbnb", "latam", "gol ", "azul ", "booking", "decolar", "smiles", "localiza", "movida", "rent ", "turism"]),
        (.pets, ["pet", "veterin", "cobasi", "petz"]),
        (.lazer, ["cinema", "ingresso", "show", "teatro", "steam", "playstation"]),
    ]

    /// Sugere a categoria pela descrição. Palavras terminadas em espaço precisam ser palavras inteiras.
    static func guessCategory(_ text: String, isIncome: Bool) -> CashCategory {
        let t = text.normalizedKey
        let padded = " " + t + " "
        for (category, keys) in isIncome ? incomeRules : expenseRules {
            let hit = keys.contains { k in
                k.hasSuffix(" ") ? padded.contains(" " + k) : t.contains(k)
            }
            if hit { return category }
        }
        return isIncome ? .outrasReceitas : .outrosGastos
    }

    // MARK: - Leitura

    /// Remove o prefixo "03/09 18:00 " que o BB coloca nos detalhes de Pix e cartão.
    private static func cleanDetails(_ s: String) -> String {
        var out = s.replacingOccurrences(of: #"^\d{2}/\d{2}(\s+\d{2}:\d{2})?\s+"#, with: "", options: .regularExpression)
        out = out.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return out.trimmingCharacters(in: .whitespaces)
    }

    private static func titleCase(_ s: String) -> String {
        s.lowercased().capitalized(with: Fmt.locale)
    }

    static func parse(_ text: String) throws -> Parsed {
        let table = CSVService.parseRows(text)
        guard table.count >= 2, let header = table.first else { throw ParseError.empty }
        let normalized = header.map(\.normalizedKey)
        var index: [Column: Int] = [:]
        for col in Column.allCases {
            if let i = normalized.firstIndex(where: { aliases[col]!.contains($0) }) { index[col] = i }
        }
        guard index[.date] != nil, index[.amount] != nil, index[.title] != nil else { throw ParseError.missingColumns }

        func cell(_ row: [String], _ c: Column) -> String {
            guard let i = index[c], i < row.count else { return "" }
            return row[i]
        }

        var parsed = Parsed(rows: [])
        for (offset, row) in table.dropFirst().enumerated() {
            let title = cell(row, .title).trimmingCharacters(in: .whitespaces)
            let nt = title.normalizedKey
            if balanceTitles.contains(nt) { parsed.skippedBalance += 1; continue }
            guard let date = CSVService.parseDate(cell(row, .date)), var amount = Fmt.parseNumber(cell(row, .amount)), amount != 0 else {
                parsed.invalid += 1
                continue
            }
            let type = cell(row, .type).normalizedKey
            if type == "saida" && amount > 0 { amount = -amount }
            if type == "entrada" && amount < 0 { amount = -amount }
            let details = cleanDetails(cell(row, .details))
            let nd = details.normalizedKey
            let isInvestment = investmentKeys.contains { nt.contains($0) || nd.contains($0) }
            let isIncome = amount > 0
            let doc = cell(row, .doc).trimmingCharacters(in: .whitespaces)
            let value = abs(amount)
            let ref = "extrato:\(Fmt.day.string(from: date)):\(doc.isEmpty ? String(offset) : doc):\(String(format: "%.2f", value)):\(nt)"
            let note = details.isEmpty ? titleCase(title) : "\(titleCase(title)) · \(titleCase(details))"
            if isInvestment { parsed.skippedInvestment += 1 }
            parsed.rows.append(Row(
                id: offset,
                date: date,
                title: title,
                details: details,
                note: note,
                amount: value,
                isIncome: isIncome,
                isInvestment: isInvestment,
                ref: ref,
                category: guessCategory(title + " " + details, isIncome: isIncome),
                include: !isInvestment
            ))
        }
        return parsed
    }

    // MARK: - Categorias lembradas

    private static let rulesKey = "statement.categoryRules"

    static func ruleKey(for row: Row) -> String {
        ruleKey(title: row.title, details: row.details)
    }

    static func ruleKey(title: String, details: String) -> String {
        (details.isEmpty ? title : details).normalizedKey
            .replacingOccurrences(of: #"[0-9./-]{6,}"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    static func loadRules(_ defaults: UserDefaults = .standard) -> [String: String] {
        (defaults.dictionary(forKey: rulesKey) as? [String: String]) ?? [:]
    }

    static func saveRules(_ rules: [String: String], _ defaults: UserDefaults = .standard) {
        defaults.set(rules, forKey: rulesKey)
    }

    /// Aplica as categorias escolhidas em importações anteriores e marca o que já foi importado.
    static func prepare(_ rows: [Row], rules: [String: String], existingRefs: Set<String>, catalog: CategoryCatalog = CategoryCatalog()) -> [Row] {
        rows.map { row in
            var r = row
            if let raw = rules[ruleKey(for: r)], catalog.exists(raw), catalog.lookup(raw).isIncome == r.isIncome {
                r.categoryKey = raw
                r.isRemembered = true
            }
            if existingRefs.contains(r.ref) {
                r.isDuplicate = true
                r.include = false
            }
            if cardItemized && !r.isIncome && r.customKey == nil && r.category == .cartao {
                r.isCardPayment = true
                r.include = false
            }
            return r
        }
    }

    /// Guarda a categoria escolhida quando ela é diferente da sugestão automática.
    static func learn(from rows: [Row], rules: [String: String]) -> [String: String] {
        var rules = rules
        for r in rows where r.include && !r.isInvestment {
            let key = ruleKey(for: r)
            guard !key.isEmpty else { continue }
            let guessed = guessCategory(r.title + " " + r.details, isIncome: r.isIncome)
            if r.categoryKey != guessed.rawValue { rules[key] = r.categoryKey } else { rules.removeValue(forKey: key) }
        }
        return rules
    }

    /// Grava as linhas escolhidas, ignorando as que já existem.
    @MainActor
    @discardableResult
    static func importRows(_ rows: [Row], into context: ModelContext) -> (added: Int, duplicates: Int) {
        let existing = Set(((try? context.fetch(FetchDescriptor<CashTransaction>())) ?? []).map(\.ref).filter { !$0.isEmpty })
        var seen = existing
        var added = 0, duplicates = 0
        for r in rows where r.include {
            if seen.contains(r.ref) { duplicates += 1; continue }
            context.insert(CashTransaction(date: r.date, amount: r.amount, categoryKey: r.categoryKey, isIncome: r.isIncome, note: r.note, ref: r.ref))
            seen.insert(r.ref)
            added += 1
        }
        try? context.save()
        return (added, duplicates)
    }
}
