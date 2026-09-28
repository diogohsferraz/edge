import Foundation
import PDFKit
import SwiftData

/// Importa a fatura do cartão de crédito (PDF) para o Orçamento.
/// Testado com a fatura Ourocard do Banco do Brasil. As compras vão para as categorias de despesa e o
/// pagamento da fatura passa a ser transferência, para não contar o mesmo gasto duas vezes.
enum InvoiceImporter {
    enum Kind { case purchase, payment, credit }

    struct Installment: Equatable {
        let number: Int
        let total: Int
    }

    struct Row: Identifiable, Equatable {
        let id: Int
        let date: Date
        let purchaseDate: Date
        let title: String
        let section: String
        let note: String
        let amount: Double
        let kind: Kind
        let installment: Installment?
        let ref: String
        /// Categoria sugerida pela seção da fatura ou pela descrição.
        let suggested: CashCategory
        var category: CashCategory
        /// Categoria personalizada escolhida (sobrepõe `category`).
        var customKey: String?
        var include: Bool
        var tags: [String] = []
        var isDuplicate = false
        var isRemembered = false

        var isIncome: Bool { kind != .purchase }

        var categoryKey: String {
            get { customKey ?? category.rawValue }
            set {
                if let c = CashCategory(rawValue: newValue) { category = c; customKey = nil } else { customKey = newValue }
            }
        }
    }

    struct Info: Equatable {
        var issuer = "Cartão"
        var card = ""
        var closing: Date?
        var due: Date?
        var total: Double?
        var previous: Double?
    }

    struct Parsed {
        var info: Info
        var rows: [Row]

        var selectedNet: Double {
            rows.filter(\.include).reduce(0) { $0 + ($1.isIncome ? -$1.amount : $1.amount) }
        }
    }

    enum ParseError: LocalizedError {
        case unreadable
        case noItems

        var errorDescription: String? {
            switch self {
            case .unreadable: return "Não consegui ler o PDF da fatura."
            case .noItems: return "Não encontrei lançamentos nesta fatura. O leitor foi feito para a fatura Ourocard (BB) em PDF."
            }
        }
    }

    /// Seções da fatura do BB → categoria (nil = decidir pela descrição).
    private static let sections: [(String, CashCategory?, Bool)] = [
        ("pagamentos/creditos", nil, true),
        ("restaurantes", .alimentacao, false),
        ("supermercados", .mercado, false),
        ("saude", .saude, false),
        ("farmacias", .saude, false),
        ("vestuario", .compras, false),
        ("lojas de departamento", .compras, false),
        ("educacao", .educacao, false),
        ("lazer", .lazer, false),
        ("entretenimento", .lazer, false),
        ("viagens", .viagem, false),
        ("turismo", .viagem, false),
        ("hospedagem", .viagem, false),
        ("transporte", .transporte, false),
        ("combustivel", .transporte, false),
        ("postos", .transporte, false),
        ("telecomunicacoes", .contas, false),
        ("servicos", nil, false),
        ("outros lancamentos", nil, false),
        ("compras parceladas", nil, false),
        ("compras internacionais", nil, false),
    ]

    // MARK: - Texto do PDF

    /// Extrai o texto reconstruindo as linhas pela posição na página (como a leitura visual).
    static func extractText(from data: Data) throws -> String {
        guard let doc = PDFDocument(data: data) else { throw ParseError.unreadable }
        var pages: [String] = []
        for i in 0..<doc.pageCount {
            guard let page = doc.page(at: i) else { continue }
            let bounds = page.bounds(for: .mediaBox)
            guard let all = page.selection(for: bounds) else {
                pages.append(page.string ?? "")
                continue
            }
            struct Piece { let x: CGFloat; let text: String }
            var lines: [(y: CGFloat, pieces: [Piece])] = []
            for sel in all.selectionsByLine() {
                guard let text = sel.string?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { continue }
                let b = sel.bounds(for: page)
                let y = b.midY
                if let idx = lines.firstIndex(where: { abs($0.y - y) <= 3 }) {
                    lines[idx].pieces.append(Piece(x: b.minX, text: text))
                } else {
                    lines.append((y, [Piece(x: b.minX, text: text)]))
                }
            }
            lines.sort { $0.y > $1.y }
            pages.append(lines.map { $0.pieces.sorted { $0.x < $1.x }.map(\.text).joined(separator: " ") }.joined(separator: "\n"))
        }
        return pages.joined(separator: "\n")
    }

    // MARK: - Interpretação

    private static func firstMatch(_ pattern: String, in text: String, options: NSRegularExpression.Options = [.caseInsensitive]) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: options),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) else { return nil }
        return String(text[r])
    }

    private static func brDate(_ s: String?) -> Date? {
        guard let s else { return nil }
        return CSVService.parseDate(s)
    }

    /// Compras "dd/mm" recebem o ano pela data de fechamento da fatura.
    private static func inferDate(_ ddmm: String, closing: Date) -> Date? {
        let parts = ddmm.split(separator: "/").compactMap { Int($0) }
        guard parts.count == 2 else { return nil }
        let cal = Calendar.app
        let cy = cal.component(.year, from: closing)
        let cm = cal.component(.month, from: closing)
        let year = parts[1] > cm ? cy - 1 : cy
        var comps = DateComponents(year: year, month: parts[1], day: 1, hour: 12)
        guard let first = cal.date(from: comps), let range = cal.range(of: .day, in: .month, for: first) else { return nil }
        comps.day = min(parts[0], range.count)
        return cal.date(from: comps)
    }

    private static func titleCase(_ s: String) -> String {
        s.lowercased().capitalized(with: Fmt.locale)
    }

    static func parse(text: String) throws -> Parsed {
        // "PARC 17/21" vira "PARC17de21" para não ser confundido com uma data de compra.
        var flat = text.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        flat = flat.replacingOccurrences(of: #"PARC\s?(\d{1,2})/(\d{1,2})"#, with: "PARC$1de$2", options: [.regularExpression, .caseInsensitive])
        let nflat = flat.normalizedKey

        var info = Info()
        if nflat.contains("ourocard") || nflat.contains("banco do brasil") || nflat.contains("bb.com.br") { info.issuer = "Ourocard (BB)" }
        info.card = firstMatch(#"Final (\d{4})"#, in: flat) ?? firstMatch(#"Cart[aã]o (\d{4})"#, in: flat) ?? ""
        info.closing = brDate(firstMatch(#"Fatura fechada em (\d{2}/\d{2}/\d{4})"#, in: flat))
        info.due = brDate(firstMatch(#"Vencimento.{0,120}?(\d{2}/\d{2}/\d{4})"#, in: flat))
        info.total = firstMatch(#"Total da Fatura R\$ ?(-?[\d.]+,\d{2})"#, in: flat).flatMap(Fmt.parseNumber)
        info.previous = firstMatch(#"Saldo fatura anterior R\$ ?(-?[\d.]+,\d{2})"#, in: flat).flatMap(Fmt.parseNumber)
        let closing = info.closing ?? brDate(firstMatch(#"(\d{2}/\d{2}/\d{4})"#, in: flat)) ?? Date().noon
        info.closing = closing

        var scope = flat
        if let r = scope.range(of: #"Lan[cç]amentos nesta fatura"#, options: [.regularExpression, .caseInsensitive]) {
            scope = String(scope[r.lowerBound...])
        }
        if let r = scope.range(of: "Total da Fatura", options: .caseInsensitive) {
            scope = String(scope[..<r.lowerBound])
        }

        let pattern = #"(?:^|\s)(\d{2}/\d{2})\s((?:(?!\s\d{2}/\d{2}\s)(?!R\$).){2,90}?)\s([A-Z]{2})\sR\$\s?(-?\d{1,3}(?:\.\d{3})*,\d{2})"#
        let re = try NSRegularExpression(pattern: pattern)
        let ns = scope as NSString
        var rows: [Row] = []
        var currentSection: (name: String, category: CashCategory?, isPayments: Bool)?
        var last = 0
        var seen: [String: Int] = [:]
        let parcRe = try NSRegularExpression(pattern: #"PARC(\d{1,2})de(\d{1,2})"#, options: .caseInsensitive)

        for m in re.matches(in: scope, range: NSRange(location: 0, length: ns.length)) {
            // O texto entre um lançamento e outro pode ter o título de uma seção.
            let gap = ns.substring(with: NSRange(location: last, length: max(0, m.range.location - last))).normalizedKey
            var best: (Int, (String, CashCategory?, Bool))?
            for s in sections {
                if let r = gap.range(of: s.0, options: .backwards) {
                    let pos = gap.distance(from: gap.startIndex, to: r.lowerBound)
                    if best == nil || pos > best!.0 { best = (pos, s) }
                }
            }
            if let b = best { currentSection = (b.1.0, b.1.1, b.1.2) }
            last = m.range.location + m.range.length

            let ddmm = ns.substring(with: m.range(at: 1))
            let rawDesc = ns.substring(with: m.range(at: 2)).trimmingCharacters(in: .whitespaces)
            guard let signed = Fmt.parseNumber(ns.substring(with: m.range(at: 4))), signed != 0,
                  let purchaseDate = inferDate(ddmm, closing: closing) else { continue }

            var installment: Installment?
            let rd = rawDesc as NSString
            if let pm = parcRe.firstMatch(in: rawDesc, range: NSRange(location: 0, length: rd.length)),
               let n = Int(rd.substring(with: pm.range(at: 1))), let t = Int(rd.substring(with: pm.range(at: 2))) {
                installment = Installment(number: n, total: t)
            }
            let desc = rawDesc
                .replacingOccurrences(of: #"\s*(TIT-)?PARC\d{1,2}de\d{1,2}"#, with: "", options: [.regularExpression, .caseInsensitive])
                .replacingOccurrences(of: #"\s*\|\s*"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            // Parcelas a partir da 2ª pertencem ao mês desta fatura.
            let date = (installment?.number ?? 1) > 1 ? closing : purchaseDate
            let inPayments = currentSection?.isPayments ?? false
            let kind: Kind
            if signed < 0 {
                kind = inPayments && desc.range(of: #"PGTO|PAGAMENTO|PAGTO"#, options: [.regularExpression, .caseInsensitive]) != nil ? .payment : .credit
            } else {
                kind = inPayments ? .credit : .purchase
            }
            let category: CashCategory = kind == .purchase
                ? (currentSection?.category ?? StatementImporter.guessCategory(desc, isIncome: false))
                : .outrasReceitas
            let amount = abs(signed)
            let base = ["fatura", info.card, Fmt.day.string(from: closing), Fmt.day.string(from: purchaseDate), desc.normalizedKey,
                        installment.map { "\($0.number)-\($0.total)" } ?? "", String(format: "%.2f", amount)].joined(separator: ":")
            seen[base, default: 0] += 1
            var note = titleCase(desc)
            if let i = installment { note += " · parcela \(i.number)/\(i.total)" }
            rows.append(Row(
                id: rows.count,
                date: date,
                purchaseDate: purchaseDate,
                title: desc,
                section: currentSection?.name ?? "",
                note: note,
                amount: amount,
                kind: kind,
                installment: installment,
                ref: base + ":\(seen[base]!)",
                suggested: category,
                category: category,
                include: kind != .payment
            ))
        }
        guard !rows.isEmpty else { throw ParseError.noItems }

        // Estorno com o mesmo valor de uma cobrança: os dois se anulam.
        for ci in rows.indices where rows[ci].kind == .credit {
            if let pi = rows.indices.first(where: { rows[$0].kind == .purchase && rows[$0].include && !rows[$0].tags.contains("estornado") && abs(rows[$0].amount - rows[ci].amount) < 0.005 }) {
                rows[pi].include = false
                rows[pi].tags.append("estornado")
                rows[ci].include = false
                rows[ci].tags.append("estorno")
            }
        }
        for i in rows.indices where rows[i].kind == .payment { rows[i].tags.append("pagamento da fatura") }
        return Parsed(info: info, rows: rows)
    }

    // MARK: - Duplicidade

    /// Pagamentos de fatura já lançados pelo extrato. Os que batem com o total desta fatura,
    /// com o saldo anterior ou com um pagamento listado nela vêm sugeridos para remoção.
    static func cardPayments(in transactions: [CashTransaction], for parsed: Parsed) -> [(transaction: CashTransaction, suggested: Bool)] {
        let targets = ([parsed.info.total, parsed.info.previous].compactMap { $0 } + parsed.rows.filter { $0.kind == .payment }.map(\.amount)).filter { $0 > 0 }
        return transactions
            .filter { $0.category == .cartao && !$0.ref.hasPrefix("fatura:") }
            .sorted { $0.date > $1.date }
            .map { t in (t, targets.contains { abs($0 - t.amount) < 0.01 }) }
    }

    static func prepare(_ rows: [Row], rules: [String: String], existingRefs: Set<String>, catalog: CategoryCatalog = CategoryCatalog()) -> [Row] {
        rows.map { row in
            var r = row
            if r.kind == .purchase, let raw = rules[StatementImporter.ruleKey(title: r.title, details: "")], catalog.exists(raw), !catalog.lookup(raw).isIncome {
                r.categoryKey = raw
                r.isRemembered = true
            }
            if existingRefs.contains(r.ref) {
                r.isDuplicate = true
                r.include = false
            }
            return r
        }
    }

    /// Lembra a categoria escolhida quando ela é diferente da sugerida.
    static func learn(from rows: [Row], rules: [String: String]) -> [String: String] {
        var rules = rules
        for r in rows where r.include && r.kind == .purchase {
            let key = StatementImporter.ruleKey(title: r.title, details: "")
            guard !key.isEmpty else { continue }
            if r.categoryKey != r.suggested.rawValue { rules[key] = r.categoryKey } else if r.isRemembered == false { rules.removeValue(forKey: key) }
        }
        return rules
    }

    /// Grava as linhas escolhidas, remove os pagamentos de fatura marcados e passa a tratar
    /// pagamentos de fatura como transferência nos próximos extratos.
    @MainActor
    @discardableResult
    static func importRows(_ rows: [Row], removing payments: [CashTransaction], into context: ModelContext) -> (added: Int, duplicates: Int, removed: Int) {
        payments.forEach { context.delete($0) }
        var seen = Set(((try? context.fetch(FetchDescriptor<CashTransaction>())) ?? []).map(\.ref).filter { !$0.isEmpty })
        var added = 0, duplicates = 0
        for r in rows where r.include {
            if seen.contains(r.ref) { duplicates += 1; continue }
            let categoryKey = r.kind == .purchase ? r.categoryKey : CashCategory.outrasReceitas.rawValue
            let note = r.kind == .credit ? "Crédito na fatura · " + r.note : r.note
            context.insert(CashTransaction(date: r.date, amount: r.amount, categoryKey: categoryKey, isIncome: r.kind != .purchase, note: note, ref: r.ref))
            seen.insert(r.ref)
            added += 1
        }
        try? context.save()
        StatementImporter.cardItemized = true
        return (added, duplicates, payments.count)
    }
}
