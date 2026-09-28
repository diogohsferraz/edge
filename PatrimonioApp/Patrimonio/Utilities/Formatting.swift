import Foundation

enum Fmt {
    static let locale = Locale(identifier: "pt_BR")

    private static let currencyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = locale
        f.currencyCode = "BRL"
        return f
    }()

    private static let percentFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .percent
        f.locale = locale
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    private static let decimalFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = locale
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    static let hiddenMask = "R$ •••••"

    static func currency(_ value: Double, hidden: Bool = false) -> String {
        if hidden { return hiddenMask }
        return currencyFormatter.string(from: NSNumber(value: value)) ?? "R$ 0,00"
    }

    static func signedCurrency(_ value: Double, hidden: Bool = false) -> String {
        if hidden { return hiddenMask }
        let s = currency(abs(value))
        if value > 0.004 { return "+" + s }
        if value < -0.004 { return "−" + s }
        return s
    }

    /// Valor curto para eixos de gráficos: "R$ 350 mil", "R$ 1,2 mi".
    static func compactCurrency(_ value: Double) -> String {
        let a = abs(value)
        let sign = value < 0 ? "−" : ""
        func short(_ v: Double) -> String {
            let f = NumberFormatter()
            f.locale = locale
            f.numberStyle = .decimal
            f.maximumFractionDigits = v < 10 ? 1 : 0
            return f.string(from: NSNumber(value: v)) ?? "\(v)"
        }
        switch a {
        case 1_000_000...: return "\(sign)R$ \(short(a / 1_000_000)) mi"
        case 1_000...: return "\(sign)R$ \(short(a / 1_000)) mil"
        default: return "\(sign)R$ \(short(a))"
        }
    }

    /// `value` em fração (0,05 = 5%).
    static func percent(_ value: Double, signed: Bool = false) -> String {
        let s = percentFormatter.string(from: NSNumber(value: value)) ?? "0%"
        if signed && value > 0.00005 { return "+" + s }
        return s
    }

    /// Texto usado para preencher campos de edição ("1234,56").
    static func editable(_ value: Double) -> String {
        decimalFormatter.string(from: NSNumber(value: value)) ?? ""
    }

    static let day: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.dateFormat = "dd/MM/yyyy"
        return f
    }()

    static let shortDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.dateFormat = "dd/MM"
        return f
    }()

    static let monthYear: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.dateFormat = "MMMM 'de' yyyy"
        return f
    }()

    static let shortMonthYear: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.dateFormat = "MMM/yy"
        return f
    }()

    /// Converte textos como "R$ 1.234,56", "1234,56", "1,234.56" ou "-500" em número.
    static func parseNumber(_ raw: String) -> Double? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        var negative = false
        if s.hasPrefix("(") && s.hasSuffix(")") { negative = true }
        if s.contains("-") || s.contains("−") { negative = true }
        s = String(s.filter { $0.isNumber || $0 == "," || $0 == "." })
        if s.isEmpty { return nil }

        let lastComma = s.lastIndex(of: ",")
        let lastDot = s.lastIndex(of: ".")
        if let c = lastComma, let d = lastDot {
            if c > d {
                // 1.234,56
                s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
            } else {
                // 1,234.56
                s = s.replacingOccurrences(of: ",", with: "")
            }
        } else if lastComma != nil {
            let parts = s.split(separator: ",", omittingEmptySubsequences: false)
            if parts.count > 2 {
                s = s.replacingOccurrences(of: ",", with: "")
            } else {
                s = s.replacingOccurrences(of: ",", with: ".")
            }
        } else if lastDot != nil {
            let parts = s.split(separator: ".", omittingEmptySubsequences: false)
            // "1.234.567" ou "1.234" → separador de milhar (padrão brasileiro)
            if parts.count > 2 || (parts.count == 2 && parts[1].count == 3) {
                s = s.replacingOccurrences(of: ".", with: "")
            }
        }
        guard let v = Double(s) else { return nil }
        return negative ? -v : v
    }
}

extension String {
    /// Minúsculo, sem acentos e sem espaços extras — usado para comparar nomes.
    var normalizedKey: String {
        folding(options: [.diacriticInsensitive, .caseInsensitive, .widthInsensitive], locale: Fmt.locale)
            .lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

extension Calendar {
    static let app: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Fmt.locale
        c.timeZone = .current
        return c
    }()
}

extension Date {
    /// Meio-dia do mesmo dia — evita problemas de fuso horário ao comparar datas.
    var noon: Date {
        Calendar.app.date(bySettingHour: 12, minute: 0, second: 0, of: self) ?? self
    }

    /// Último instante do dia.
    var endOfDay: Date {
        let start = Calendar.app.startOfDay(for: self)
        return (Calendar.app.date(byAdding: .day, value: 1, to: start) ?? self).addingTimeInterval(-1)
    }

    var startOfMonth: Date {
        let c = Calendar.app.dateComponents([.year, .month], from: self)
        return Calendar.app.date(from: c) ?? self
    }

    var startOfNextMonth: Date {
        Calendar.app.date(byAdding: .month, value: 1, to: startOfMonth) ?? self
    }

    /// Último instante do mês.
    var endOfMonth: Date { startOfNextMonth.addingTimeInterval(-1) }

    func addingMonths(_ n: Int) -> Date {
        Calendar.app.date(byAdding: .month, value: n, to: self) ?? self
    }

    /// Chave "yyyy-MM" usada para cruzar séries mensais (ex.: CDI).
    var monthKey: String {
        let c = Calendar.app.dateComponents([.year, .month], from: self)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }

    func isSameMonth(as other: Date) -> Bool {
        Calendar.app.isDate(self, equalTo: other, toGranularity: .month)
    }
}
