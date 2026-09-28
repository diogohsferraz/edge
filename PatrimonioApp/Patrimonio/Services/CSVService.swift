import Foundation
import SwiftData

/// Importação e exportação de planilhas (CSV) para migrar do Excel / Google Sheets.
///
/// Dois formatos são aceitos:
///
/// 1. **Formato em linhas** (um lançamento por linha):
///    `data;instituicao;ativo;classe;saldo;aporte;resgate;proventos`
///
/// 2. **Formato em colunas por mês** (como a maioria das planilhas de patrimônio):
///    `instituicao;ativo;classe;01/2025;02/2025;03/2025`
///    Cada célula é o saldo do ativo no fim daquele mês.
enum CSVService {
    struct ImportSummary {
        var institutionsCreated = 0
        var assetsCreated = 0
        var balances = 0
        var movements = 0
        var skippedRows = 0

        var description: String {
            var parts = ["\(balances) saldos", "\(movements) movimentações"]
            if assetsCreated > 0 { parts.append("\(assetsCreated) ativos novos") }
            if institutionsCreated > 0 { parts.append("\(institutionsCreated) instituições novas") }
            var text = "Importados: " + parts.joined(separator: ", ") + "."
            if skippedRows > 0 { text += " \(skippedRows) linha(s) ignorada(s)." }
            return text
        }
    }

    enum ImportError: LocalizedError {
        case empty
        case missingColumns(String)

        var errorDescription: String? {
            switch self {
            case .empty: return "O arquivo está vazio."
            case .missingColumns(let detail): return "Não encontrei as colunas necessárias. \(detail)"
            }
        }
    }

    // MARK: - Leitura de texto

    static func decodeText(_ data: Data) -> String {
        var text = String(data: data, encoding: .utf8)
            ?? String(data: data, encoding: .windowsCP1252)
            ?? String(data: data, encoding: .isoLatin1)
            ?? ""
        if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
        return text
    }

    static func detectDelimiter(_ headerLine: String) -> Character {
        let candidates: [Character] = [";", "\t", ","]
        return candidates.max { a, b in
            headerLine.filter { $0 == a }.count < headerLine.filter { $0 == b }.count
        } ?? ";"
    }

    /// Parser CSV simples com suporte a campos entre aspas.
    static func parseRows(_ text: String) -> [[String]] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        guard let firstLine = normalized.split(separator: "\n", omittingEmptySubsequences: true).first else { return [] }
        let delimiter = detectDelimiter(String(firstLine))

        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var inQuotes = false
        var iterator = Array(normalized)
        iterator.append("\n")
        var i = 0
        while i < iterator.count {
            let ch = iterator[i]
            if inQuotes {
                if ch == "\"" {
                    if i + 1 < iterator.count && iterator[i + 1] == "\"" {
                        field.append("\"")
                        i += 1
                    } else {
                        inQuotes = false
                    }
                } else {
                    field.append(ch)
                }
            } else if ch == "\"" {
                inQuotes = true
            } else if ch == delimiter {
                row.append(field.trimmingCharacters(in: .whitespaces))
                field = ""
            } else if ch == "\n" {
                row.append(field.trimmingCharacters(in: .whitespaces))
                field = ""
                if row.contains(where: { !$0.isEmpty }) { rows.append(row) }
                row = []
            } else {
                field.append(ch)
            }
            i += 1
        }
        return rows
    }

    // MARK: - Datas

    private static let dateFormats = ["dd/MM/yyyy", "d/M/yyyy", "dd/MM/yy", "yyyy-MM-dd", "dd-MM-yyyy", "dd.MM.yyyy"]
    private static let monthFormats = ["MM/yyyy", "M/yyyy", "MM/yy", "yyyy-MM", "MMM/yy", "MMM/yyyy", "MMMM/yyyy", "MMM yyyy", "MMMM yyyy", "MMMM 'de' yyyy"]

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Fmt.locale
        f.calendar = Calendar.app
        f.timeZone = .current
        f.dateFormat = format
        f.isLenient = false
        return f
    }

    static func parseDate(_ raw: String) -> Date? {
        let s = raw.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return nil }
        for format in dateFormats {
            if let d = formatter(format).date(from: s) { return d.noon }
        }
        return nil
    }

    /// Cabeçalhos como "01/2025", "jan/25" ou "Janeiro 2025" viram o último dia do mês.
    static func parseMonthHeader(_ raw: String) -> Date? {
        let s = raw.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ".", with: "")
        guard !s.isEmpty else { return nil }
        if let full = parseDate(s) { return full }
        for format in monthFormats {
            if let d = formatter(format).date(from: s) ?? formatter(format).date(from: s.lowercased()) {
                return d.endOfMonth.noon
            }
        }
        return nil
    }

    // MARK: - Colunas

    private enum Column {
        case date, institution, asset, assetClass, balance, aporte, resgate, provento, ticker
    }

    private static let aliases: [Column: [String]] = [
        .date: ["data", "date", "dia"],
        .institution: ["instituicao", "banco", "corretora", "instituição", "conta", "local"],
        .asset: ["ativo", "investimento", "nome", "produto", "aplicacao", "descricao"],
        .assetClass: ["classe", "tipo", "categoria", "classe de ativo"],
        .balance: ["saldo", "valor", "valor atual", "saldo atual", "patrimonio", "posicao"],
        .aporte: ["aporte", "aportes", "aplicado", "deposito"],
        .resgate: ["resgate", "resgates", "retirada", "saque"],
        .provento: ["proventos", "provento", "dividendos", "rendimentos pagos", "juros recebidos"],
        .ticker: ["ticker", "codigo", "código"],
    ]

    private static func column(for header: String) -> Column? {
        let key = header.normalizedKey
        for (col, names) in aliases where names.contains(where: { $0.normalizedKey == key }) {
            return col
        }
        return nil
    }

    // MARK: - Importação

    @MainActor
    static func importCSV(text: String, into context: ModelContext) throws -> ImportSummary {
        let rows = parseRows(text)
        guard let header = rows.first, rows.count > 1 else { throw ImportError.empty }

        var map: [Column: Int] = [:]
        var monthColumns: [(Int, Date)] = []
        for (idx, h) in header.enumerated() {
            if let col = column(for: h), map[col] == nil {
                map[col] = idx
            } else if let month = parseMonthHeader(h) {
                monthColumns.append((idx, month))
            }
        }

        guard let assetCol = map[.asset] else {
            throw ImportError.missingColumns("É obrigatória uma coluna \"ativo\" (nome do investimento).")
        }

        var summary = ImportSummary()
        var cache: [String: Asset] = [:]
        var touched: Set<UUID> = []
        var newInstitutions: Set<UUID> = []
        var institutionCache: [String: Institution] = [:]
        let existingInstitutions = Set(((try? context.fetch(FetchDescriptor<Institution>())) ?? []).map(\.uid))
        let existingAssets = (try? context.fetch(FetchDescriptor<Asset>())) ?? []

        func cell(_ row: [String], _ col: Column) -> String {
            guard let i = map[col], i < row.count else { return "" }
            return row[i]
        }

        func resolveAsset(_ row: [String]) -> Asset? {
            let name = row[assetCol].trimmingCharacters(in: .whitespaces)
            guard !name.isEmpty else { return nil }
            let instName = cell(row, .institution)
            let key = instName.normalizedKey + "|" + name.normalizedKey
            if let a = cache[key] { return a }

            let instLabel = instName.isEmpty ? "Sem instituição" : instName
            let institution = institutionCache[instLabel.normalizedKey]
                ?? PortfolioStore.findOrCreateInstitution(named: instLabel, in: context)
            institutionCache[instLabel.normalizedKey] = institution
            if !existingInstitutions.contains(institution.uid) && !newInstitutions.contains(institution.uid) {
                newInstitutions.insert(institution.uid)
                summary.institutionsCreated += 1
            }
            if let found = existingAssets.first(where: { $0.name.normalizedKey == name.normalizedKey && $0.institution === institution }) {
                cache[key] = found
                return found
            }
            let asset = PortfolioStore.createAsset(
                name: name,
                assetClass: AssetClass.match(cell(row, .assetClass).isEmpty ? name : cell(row, .assetClass)),
                institution: institution,
                ticker: cell(row, .ticker),
                in: context
            )
            summary.assetsCreated += 1
            cache[key] = asset
            return asset
        }

        if map[.date] == nil && !monthColumns.isEmpty {
            // Formato em colunas por mês.
            for row in rows.dropFirst() {
                guard assetCol < row.count, let asset = resolveAsset(row) else { summary.skippedRows += 1; continue }
                touched.insert(asset.uid)
                for (idx, month) in monthColumns where idx < row.count {
                    guard let v = Fmt.parseNumber(row[idx]) else { continue }
                    PortfolioStore.recordBalance(v, on: month, for: asset, in: context)
                    summary.balances += 1
                }
            }
        } else {
            guard map[.date] != nil else {
                throw ImportError.missingColumns("Inclua uma coluna \"data\" ou colunas com meses (ex.: 01/2025).")
            }
            for row in rows.dropFirst() {
                guard assetCol < row.count, let date = parseDate(cell(row, .date)), let asset = resolveAsset(row) else {
                    summary.skippedRows += 1
                    continue
                }
                touched.insert(asset.uid)
                if let v = Fmt.parseNumber(cell(row, .balance)) {
                    PortfolioStore.recordBalance(v, on: date, for: asset, in: context)
                    summary.balances += 1
                }
                if let a = Fmt.parseNumber(cell(row, .aporte)), a != 0 {
                    // Aporte negativo na planilha é tratado como resgate.
                    PortfolioStore.recordMovement(a > 0 ? .aporte : .resgate, amount: abs(a), on: date, for: asset, in: context)
                    summary.movements += 1
                }
                if let r = Fmt.parseNumber(cell(row, .resgate)), r != 0 {
                    PortfolioStore.recordMovement(.resgate, amount: abs(r), on: date, for: asset, in: context)
                    summary.movements += 1
                }
                if let p = Fmt.parseNumber(cell(row, .provento)), p != 0 {
                    PortfolioStore.recordMovement(.provento, amount: abs(p), on: date, for: asset, in: context)
                    summary.movements += 1
                }
            }
        }

        // Ativos sem nenhum aporte registrado: o primeiro saldo vira a posição inicial,
        // para que a rentabilidade não considere o saldo inicial como "lucro".
        for asset in cache.values where touched.contains(asset.uid) && asset.movements.isEmpty {
            if let first = asset.sortedSnapshots.first, first.value > 0 {
                PortfolioStore.recordMovement(.aporte, amount: first.value, on: first.date, for: asset, note: "Posição inicial (importação)", in: context)
                summary.movements += 1
            }
        }

        try context.save()
        return summary
    }

    // MARK: - Exportação

    @MainActor
    static func exportCSV(assets: [Asset]) -> String {
        struct Line {
            var balance: Double?
            var aporte = 0.0
            var resgate = 0.0
            var provento = 0.0
        }
        var out = ["data;instituicao;ativo;classe;saldo;aporte;resgate;proventos"]
        func num(_ v: Double) -> String { Fmt.editable(v).replacingOccurrences(of: ".", with: "") }

        for asset in assets.sorted(by: { ($0.institutionName, $0.name) < ($1.institutionName, $1.name) }) {
            var lines: [Date: Line] = [:]
            for s in asset.snapshots { lines[s.date.noon, default: Line()].balance = s.value }
            for m in asset.movements {
                switch m.kind {
                case .aporte: lines[m.date.noon, default: Line()].aporte += m.amount
                case .resgate: lines[m.date.noon, default: Line()].resgate += m.amount
                case .provento: lines[m.date.noon, default: Line()].provento += m.amount
                }
            }
            for date in lines.keys.sorted() {
                let l = lines[date]!
                let fields = [
                    Fmt.day.string(from: date),
                    asset.institutionName,
                    asset.name,
                    asset.assetClass.title,
                    l.balance.map(num) ?? "",
                    l.aporte > 0 ? num(l.aporte) : "",
                    l.resgate > 0 ? num(l.resgate) : "",
                    l.provento > 0 ? num(l.provento) : "",
                ].map(escape)
                out.append(fields.joined(separator: ";"))
            }
        }
        return out.joined(separator: "\n")
    }

    static func exportTransactionsCSV(_ transactions: [CashTransaction], catalog: CategoryCatalog = CategoryCatalog()) -> String {
        var out = ["data;tipo;categoria;valor;descricao"]
        for t in transactions.sorted(by: { $0.date < $1.date }) {
            out.append([
                Fmt.day.string(from: t.date),
                t.isIncome ? "Receita" : "Despesa",
                catalog.label(t.categoryRaw),
                Fmt.editable(t.amount).replacingOccurrences(of: ".", with: ""),
                t.note,
            ].map(escape).joined(separator: ";"))
        }
        return out.joined(separator: "\n")
    }

    private static func escape(_ s: String) -> String {
        if s.contains(";") || s.contains("\"") || s.contains("\n") {
            return "\"" + s.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        return s
    }

    static func writeTemporaryFile(named name: String, contents: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        // BOM para o Excel abrir acentos corretamente.
        try ("\u{FEFF}" + contents).write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    static let sampleTemplate = """
    data;instituicao;ativo;classe;saldo;aporte;resgate;proventos
    31/01/2026;Nubank;Caixinha Reserva;Conta e Poupança;10.000,00;10.000,00;;
    31/01/2026;XP Investimentos;CDB 110% CDI;Renda Fixa;25.000,00;25.000,00;;
    28/02/2026;Nubank;Caixinha Reserva;Conta e Poupança;10.500,00;400,00;;
    28/02/2026;XP Investimentos;CDB 110% CDI;Renda Fixa;25.260,00;;;
    """
}
