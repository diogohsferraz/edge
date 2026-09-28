import Foundation

/// Busca CDI e IPCA mensais na API pública do Banco Central (SGS) para comparar com a carteira.
/// - CDI acumulado no mês: série 4391 (% a.m.)
/// - IPCA mensal: série 433 (% a.m.)
@MainActor
final class BenchmarkStore: ObservableObject {
    /// Chave "yyyy-MM" → taxa do mês em fração (0,01 = 1%).
    @Published private(set) var cdi: [String: Double] = [:]
    @Published private(set) var ipca: [String: Double] = [:]
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var isLoading = false
    @Published private(set) var lastError: String?

    private let defaults = UserDefaults.standard
    private let cdiKey = "benchmark.cdi"
    private let ipcaKey = "benchmark.ipca"
    private let dateKey = "benchmark.updated"

    init() {
        cdi = (defaults.dictionary(forKey: cdiKey) as? [String: Double]) ?? [:]
        ipca = (defaults.dictionary(forKey: ipcaKey) as? [String: Double]) ?? [:]
        lastUpdated = defaults.object(forKey: dateKey) as? Date
    }

    func refreshIfNeeded() async {
        if let lastUpdated, Date().timeIntervalSince(lastUpdated) < 60 * 60 * 12, !cdi.isEmpty { return }
        await refresh()
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            async let c = Self.fetch(series: 4391)
            async let i = Self.fetch(series: 433)
            let (newCDI, newIPCA) = try await (c, i)
            cdi = newCDI
            ipca = newIPCA
            lastUpdated = Date()
            lastError = nil
            defaults.set(newCDI, forKey: cdiKey)
            defaults.set(newIPCA, forKey: ipcaKey)
            defaults.set(lastUpdated, forKey: dateKey)
        } catch {
            lastError = "Não foi possível atualizar CDI/IPCA. Verifique sua conexão."
        }
    }

    private struct SGSItem: Decodable {
        let data: String
        let valor: String
    }

    private static func fetch(series: Int) async throws -> [String: Double] {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "dd/MM/yyyy"
        let start = f.string(from: Date().addingMonths(-120))
        let end = f.string(from: Date())
        var comps = URLComponents(string: "https://api.bcb.gov.br/dados/serie/bcdata.sgs.\(series)/dados")!
        comps.queryItems = [
            URLQueryItem(name: "formato", value: "json"),
            URLQueryItem(name: "dataInicial", value: start),
            URLQueryItem(name: "dataFinal", value: end),
        ]
        let (data, response) = try await URLSession.shared.data(from: comps.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
        let items = try JSONDecoder().decode([SGSItem].self, from: data)
        var result: [String: Double] = [:]
        for item in items {
            guard let date = f.date(from: item.data), let v = Double(item.valor.replacingOccurrences(of: ",", with: ".")) else { continue }
            result[date.monthKey] = v / 100
        }
        return result
    }
}
