import XCTest
import SwiftData
@testable import Patrimonio

final class PortfolioAnalyticsTests: XCTestCase {
    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        Calendar.app.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
    }

    private func asset(_ cls: AssetClass = .rendaFixa, inst: String = "Banco", snapshots: [(Date, Double)], flows: [(Date, MovementKind, Double)] = []) -> AssetInput {
        AssetInput(
            id: UUID(),
            name: "Ativo",
            assetClass: cls,
            institutionName: inst,
            institutionColorHex: "#000000",
            snapshots: snapshots.map { ValuePoint(date: $0.0, value: $0.1) }.sorted { $0.date < $1.date },
            flows: flows.map { FlowInput(date: $0.0, kind: $0.1, amount: $0.2) }.sorted { $0.date < $1.date }
        )
    }

    func testValueCarriesForwardLastSnapshot() {
        let a = asset(snapshots: [(date(2026, 1, 31), 1000), (date(2026, 3, 31), 1200)])
        let analytics = PortfolioAnalytics(assets: [a])
        XCTAssertEqual(analytics.value(of: a, asOf: date(2026, 1, 15)), 0)
        XCTAssertEqual(analytics.value(of: a, asOf: date(2026, 2, 28)), 1000)
        XCTAssertEqual(analytics.value(of: a, asOf: date(2026, 4, 10)), 1200)
    }

    func testMonthlyReturnWithoutFlows() {
        let a = asset(
            snapshots: [(date(2026, 1, 31), 1000), (date(2026, 2, 28), 1010)],
            flows: [(date(2026, 1, 1), .aporte, 1000)]
        )
        let analytics = PortfolioAnalytics(assets: [a])
        let feb = analytics.performance(for: date(2026, 2, 10), now: date(2026, 3, 5))
        XCTAssertEqual(feb.startValue, 1000, accuracy: 0.001)
        XCTAssertEqual(feb.endValue, 1010, accuracy: 0.001)
        XCTAssertEqual(feb.gain, 10, accuracy: 0.001)
        XCTAssertEqual(feb.returnRate ?? 0, 0.01, accuracy: 0.0001)
    }

    func testContributionIsNotCountedAsGain() {
        let a = asset(
            snapshots: [(date(2026, 1, 31), 1000), (date(2026, 2, 28), 1510)],
            flows: [(date(2026, 1, 1), .aporte, 1000), (date(2026, 2, 27), .aporte, 500)]
        )
        let analytics = PortfolioAnalytics(assets: [a])
        let feb = analytics.performance(for: date(2026, 2, 10), now: date(2026, 3, 5))
        XCTAssertEqual(feb.aportes, 500)
        XCTAssertEqual(feb.gain, 10, accuracy: 0.001)
        // Aporte no fim do mês quase não pesa na base: ~1%.
        XCTAssertEqual(feb.returnRate ?? 0, 0.01, accuracy: 0.001)
    }

    func testFirstMonthUsesInitialContributionAsBase() {
        let a = asset(
            snapshots: [(date(2026, 1, 1), 1000), (date(2026, 1, 31), 1010)],
            flows: [(date(2026, 1, 1), .aporte, 1000)]
        )
        let analytics = PortfolioAnalytics(assets: [a])
        let jan = analytics.performance(for: date(2026, 1, 10), now: date(2026, 2, 5))
        XCTAssertEqual(jan.gain, 10, accuracy: 0.001)
        XCTAssertEqual(jan.returnRate ?? 0, 0.01, accuracy: 0.001)
    }

    func testProventoCountsAsGain() {
        let a = asset(
            .fiis,
            snapshots: [(date(2026, 1, 31), 1000), (date(2026, 2, 28), 1000)],
            flows: [(date(2026, 1, 1), .aporte, 1000), (date(2026, 2, 15), .provento, 8)]
        )
        let analytics = PortfolioAnalytics(assets: [a])
        let feb = analytics.performance(for: date(2026, 2, 10), now: date(2026, 3, 5))
        XCTAssertEqual(feb.gain, 8, accuracy: 0.001)
        XCTAssertEqual(analytics.invested(asOf: date(2026, 3, 1)), 1000)
    }

    func testEvolutionAndAllocation() {
        let a = asset(.rendaFixa, inst: "XP", snapshots: [(date(2026, 1, 31), 3000)], flows: [(date(2026, 1, 2), .aporte, 3000)])
        let b = asset(.acoes, inst: "Nubank", snapshots: [(date(2026, 1, 31), 1000)], flows: [(date(2026, 1, 2), .aporte, 1000)])
        let analytics = PortfolioAnalytics(assets: [a, b])
        let points = analytics.evolution(limit: nil, now: date(2026, 3, 15))
        XCTAssertEqual(points.count, 3)
        XCTAssertEqual(points.last?.total, 4000)
        XCTAssertEqual(points.last?.byClass[.acoes], 1000)

        let byClass = analytics.allocationByClass(asOf: date(2026, 3, 15))
        XCTAssertEqual(byClass.first?.label, AssetClass.rendaFixa.title)
        XCTAssertEqual(byClass.first?.share ?? 0, 0.75, accuracy: 0.0001)
        XCTAssertEqual(analytics.allocationByInstitution(asOf: date(2026, 3, 15)).count, 2)
    }

    func testCumulativeCompounds() {
        let points = PortfolioAnalytics.cumulative([(date(2026, 1, 1), 0.01), (date(2026, 2, 1), nil), (date(2026, 3, 1), 0.01)], series: "X")
        XCTAssertEqual(points.count, 2)
        XCTAssertEqual(points.last?.value ?? 0, 0.0201, accuracy: 0.00001)
    }

    func testMonthsToReachGoal() {
        XCTAssertEqual(PortfolioAnalytics.monthsToReach(goal: 100, current: 100, monthlyContribution: 0, monthlyRate: 0), 0)
        XCTAssertEqual(PortfolioAnalytics.monthsToReach(goal: 1000, current: 0, monthlyContribution: 100, monthlyRate: 0), 10)
        XCTAssertNil(PortfolioAnalytics.monthsToReach(goal: 1000, current: 0, monthlyContribution: 0, monthlyRate: 0))
    }
}

final class FormattingTests: XCTestCase {
    func testParseBrazilianNumbers() {
        XCTAssertEqual(Fmt.parseNumber("1.234,56"), 1234.56)
        XCTAssertEqual(Fmt.parseNumber("R$ 10.000,00"), 10000)
        XCTAssertEqual(Fmt.parseNumber("1234,5"), 1234.5)
        XCTAssertEqual(Fmt.parseNumber("1,234.56"), 1234.56)
        XCTAssertEqual(Fmt.parseNumber("1.000"), 1000)
        XCTAssertEqual(Fmt.parseNumber("12.5"), 12.5)
        XCTAssertEqual(Fmt.parseNumber("-500"), -500)
        XCTAssertNil(Fmt.parseNumber(""))
        XCTAssertNil(Fmt.parseNumber("abc"))
    }

    func testAssetClassMatching() {
        XCTAssertEqual(AssetClass.match("CDB Banco Inter"), .rendaFixa)
        XCTAssertEqual(AssetClass.match("Tesouro IPCA+ 2035"), .tesouro)
        XCTAssertEqual(AssetClass.match("FII"), .fiis)
        XCTAssertEqual(AssetClass.match("Ações"), .acoes)
        XCTAssertEqual(AssetClass.match("Poupança"), .conta)
        XCTAssertEqual(AssetClass.match("Bitcoin"), .cripto)
        XCTAssertEqual(AssetClass.match("Renda Fixa"), .rendaFixa)
    }
}

@MainActor
final class CSVServiceTests: XCTestCase {
    private var containers: [ModelContainer] = []

    private func makeContext() throws -> ModelContext {
        let config = ModelConfiguration(UUID().uuidString, isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: Institution.self, Asset.self, BalanceSnapshot.self, Movement.self, CashTransaction.self,
            configurations: config
        )
        containers.append(container)
        return ModelContext(container)
    }

    func testParseRowsHandlesQuotesAndSemicolons() {
        let rows = CSVService.parseRows("a;b;c\n1;\"x;y\";3\n\n")
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[1], ["1", "x;y", "3"])
    }

    func testImportRowFormat() throws {
        let context = try makeContext()
        let summary = try CSVService.importCSV(text: CSVService.sampleTemplate, into: context)
        XCTAssertEqual(summary.assetsCreated, 2)
        XCTAssertEqual(summary.institutionsCreated, 2)
        XCTAssertEqual(summary.balances, 4)

        let assets = try context.fetch(FetchDescriptor<Asset>())
        let reserva = try XCTUnwrap(assets.first { $0.name == "Caixinha Reserva" })
        XCTAssertEqual(reserva.currentValue, 10_500)
        XCTAssertEqual(reserva.investedAmount, 10_400)
        XCTAssertEqual(reserva.assetClass, .conta)
    }

    func testImportWideFormatCreatesInitialContribution() throws {
        let context = try makeContext()
        let csv = """
        instituicao;ativo;classe;01/2026;02/2026;03/2026
        Nubank;Caixinha;Conta;10.000;10.450;10.980
        XP;CDB 110% CDI;Renda Fixa;25.000;25.260;
        """
        let summary = try CSVService.importCSV(text: csv, into: context)
        XCTAssertEqual(summary.balances, 5)
        let assets = try context.fetch(FetchDescriptor<Asset>())
        XCTAssertEqual(assets.count, 2)
        let cdb = try XCTUnwrap(assets.first { $0.name.hasPrefix("CDB") })
        XCTAssertEqual(cdb.currentValue, 25_260)
        XCTAssertEqual(cdb.investedAmount, 25_000)

        // Reimportar não duplica saldos.
        _ = try CSVService.importCSV(text: csv, into: context)
        XCTAssertEqual(try context.fetch(FetchDescriptor<BalanceSnapshot>()).count, 5)
    }

    func testExportRoundTrip() throws {
        let context = try makeContext()
        _ = try CSVService.importCSV(text: CSVService.sampleTemplate, into: context)
        let exported = CSVService.exportCSV(assets: try context.fetch(FetchDescriptor<Asset>()))

        let other = try makeContext()
        let summary = try CSVService.importCSV(text: exported, into: other)
        XCTAssertEqual(summary.balances, 4)
        let total = try other.fetch(FetchDescriptor<Asset>()).reduce(0) { $0 + $1.currentValue }
        XCTAssertEqual(total, 10_500 + 25_260, accuracy: 0.001)
    }
}

final class StatementImporterTests: XCTestCase {
    /// Mesmo formato do extrato de conta corrente do Banco do Brasil (dados fictícios).
    static let sample = """
    "Data","Lançamento","Detalhes","N° documento","Valor","Tipo Lançamento"
    "31/08/2026","Saldo Anterior","","","0,00",""
    "01/09/2026","Recebimento de Proventos","12.345.678/0001-00 ORGAO EXEMPLO","100001","8.500,00","Entrada"
    "01/09/2026","Pix - Enviado","01/09 11:47 Fulano de Tal","90101","-32,00","Saída"
    "01/09/2026","BB Rende Fácil","Rende Facil","9903","-6.000,00","Saída"
    "01/09/2026","Saldo do dia","","","0,00",""
    "03/09/2026","Compra com Cartão","03/09 18:00 POSTO EXEMPLO","164803","-150,00","Saída"
    "03/09/2026","BB Rende Fácil","Rende Facil","9903","1.650,00","Entrada"
    "04/09/2026","Pagamento de Boleto","EDIFICIO RES JARDIM EXEMPLO","90401","-650,00","Saída"
    "04/09/2026","Pix - Enviado","04/09 12:42 SMARTFIT ESCOLA DE GINAST","90403","-195,72","Saída"
    "10/09/2026","Pix - Recebido","10/09 09:00 Ciclano Exemplo","91001","250,00","Entrada"
    "15/09/2026","Tesouro Dir-Amortizacao","","","80,88","Entrada"
    "17/09/2026","Transferido da poupança","","","500,00","Entrada"
    "20/09/2026","Pagto cartão crédito","CARTAO EXEMPLO","","-1.234,56","Saída"
    "22/09/2026","Pagamento de Impostos","DARF","","-99,90","Saída"
    "30/09/2026","S A L D O","","","1.234,00",""
    """

    func testParsesBancoDoBrasilStatement() throws {
        // O BB exporta em Latin-1: garante que a decodificação funciona.
        let data = try XCTUnwrap(Self.sample.data(using: .isoLatin1))
        let text = CSVService.decodeText(data)
        XCTAssertTrue(StatementImporter.isStatement(header: CSVService.parseRows(text)[0]))

        let parsed = try StatementImporter.parse(text)
        XCTAssertEqual(parsed.skippedBalance, 3)
        XCTAssertEqual(parsed.skippedInvestment, 4)
        let included = parsed.rows.filter(\.include)
        XCTAssertEqual(included.count, 8)

        func category(_ title: String) -> CashCategory? { included.first { $0.title == title }?.category }
        XCTAssertEqual(category("Recebimento de Proventos"), .salario)
        XCTAssertEqual(category("Compra com Cartão"), .transporte)
        XCTAssertEqual(category("Pagamento de Boleto"), .moradia)
        XCTAssertEqual(category("Pagto cartão crédito"), .cartao)
        XCTAssertEqual(category("Pagamento de Impostos"), .impostos)
        XCTAssertEqual(category("Pix - Recebido"), .outrasReceitas)
        XCTAssertEqual(included.first { $0.details.hasPrefix("SMARTFIT") }?.category, .saude)
        XCTAssertEqual(included.first { $0.details == "Fulano de Tal" }?.category, .outrosGastos)
        XCTAssertEqual(included.filter(\.isIncome).reduce(0) { $0 + $1.amount }, 8750, accuracy: 0.001)
    }

    func testRemembersChosenCategory() throws {
        var rows = try StatementImporter.parse(Self.sample).rows
        let i = try XCTUnwrap(rows.firstIndex { $0.details == "Fulano de Tal" })
        rows[i].category = .moradia
        let rules = StatementImporter.learn(from: rows, rules: [:])
        let again = StatementImporter.prepare(try StatementImporter.parse(Self.sample).rows, rules: rules, existingRefs: [])
        let row = try XCTUnwrap(again.first { $0.details == "Fulano de Tal" })
        XCTAssertEqual(row.category, .moradia)
        XCTAssertTrue(row.isRemembered)
    }

    @MainActor
    func testImportDoesNotDuplicate() throws {
        let container = try ModelContainer(
            for: Institution.self, Asset.self, BalanceSnapshot.self, Movement.self, CashTransaction.self,
            configurations: ModelConfiguration(UUID().uuidString, isStoredInMemoryOnly: true)
        )
        let context = ModelContext(container)
        let rows = try StatementImporter.parse(Self.sample).rows
        XCTAssertEqual(StatementImporter.importRows(rows, into: context).added, 8)
        let second = StatementImporter.importRows(rows, into: context)
        XCTAssertEqual(second.added, 0)
        XCTAssertEqual(second.duplicates, 8)
        XCTAssertEqual(try context.fetch(FetchDescriptor<CashTransaction>()).count, 8)

        let refs = Set(try context.fetch(FetchDescriptor<CashTransaction>()).map(\.ref))
        let prepared = StatementImporter.prepare(rows, rules: [:], existingRefs: refs)
        XCTAssertEqual(prepared.filter(\.isDuplicate).count, 8)
        XCTAssertFalse(prepared.contains(where: \.include))
    }
}


final class InvoiceImporterTests: XCTestCase {
    /// Texto da fatura fictícia (mesmo layout da fatura Ourocard do BB).
    static let sampleText = """
    Olá, Fulano, esta é sua fatura de OUROCARD VISA EXEMPLO Final 1234
    Resumo da fatura
    Vencimento Saldo fatura anterior R$ 1.500,00
    outubro
    05/10/2026 Pagamentos/Créditos R$ -1.525,00
    Compras nacionais R$ 1.396,00
    Total R$ 1.371,00
    Datas fatura
    Fatura fechada em 23/09/2026
    Fechamento da próxima fatura 26/10/2026 Valor original R$ 0,00
    Lançamentos nesta fatura
    Fulano de Tal (Cartão 1234)
    Data Descrição País Valor
    SALDO FATURA ANTERIOR BR R$ 1.500,00
    Pagamentos/Créditos
    08/09 PGTO DEBITO CONTA 1111 000001234 200 BR R$ -1.500,00
    22/09 DESC AUTOMATICO ANUD. TIT-PARC 12/12 BR R$ -25,00
    Restaurantes
    26/08 PADARIA EXEMPLO MACEIO BR R$ 14,00
    02/09 LANCHONETE EXEMPLO MACEIO BR R$ 7,00
    02/09 LANCHONETE EXEMPLO MACEIO BR R$ 7,00
    10/09 IFD*RESTAURANTE EXEMPLO MACEIO BR R$ 105,00
    Saúde
    09/09 DROGASIL 0000 MACEIO BR R$ 42,00
    Serviços
    09/09 ASSAI ATACADISTA LJ00 MACEIO BR R$ 593,97
    02/09 EBN*SPOTIFY CURITIBA BR R$ 40,90
    05/09 POSTO EXEMPLO MACEIO BR R$ 9,99
    13/09 LOJA DESCONHECIDA MACEIO BR R$ 15,00
    Supermercados
    07/09 UNICOMPRA MACEIO BR R$ 142,23
    Outros lançamentos
    22/09 ANUIDADE DIFERENCIADA TIT-PARC 12/12 BR R$ 25,00
    Compras parceladas
    22/04 CLARO EXEMPLO PARC 17/21 MACEIO BR R$ 237,57
    28/11 HOTEL EXEMPLO PARC 10/10 GRAVATA BR R$ 100,00
    15/09 LEROY MERLIN PARC 01/06 MACEIO BR R$ 56,34
    Página 1/2
    Total da Fatura R$ 1.371,00
    """

    override func tearDown() {
        StatementImporter.cardItemized = false
        super.tearDown()
    }

    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        Calendar.app.date(from: DateComponents(year: y, month: m, day: d, hour: 12))!
    }

    private func check(_ parsed: InvoiceImporter.Parsed, file: StaticString = #filePath, line: UInt = #line) {
        let info = parsed.info
        XCTAssertEqual(info.card, "1234", file: file, line: line)
        XCTAssertEqual(info.closing, date(2026, 9, 23), file: file, line: line)
        XCTAssertEqual(info.due, date(2026, 10, 5), file: file, line: line)
        XCTAssertEqual(info.total ?? 0, 1371, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(info.previous ?? 0, 1500, accuracy: 0.001, file: file, line: line)
        // O total selecionado confere com o total da fatura.
        XCTAssertEqual(parsed.selectedNet, 1371, accuracy: 0.001, file: file, line: line)

        func row(_ prefix: String) -> InvoiceImporter.Row? { parsed.rows.first { $0.title.hasPrefix(prefix) } }
        XCTAssertEqual(row("PADARIA")?.category, .alimentacao, file: file, line: line)
        XCTAssertEqual(row("ASSAI")?.category, .mercado, file: file, line: line)
        XCTAssertEqual(row("EBN*SPOTIFY")?.category, .assinaturas, file: file, line: line)
        XCTAssertEqual(row("POSTO")?.category, .transporte, file: file, line: line)
        XCTAssertEqual(row("LOJA DESCONHECIDA")?.category, .outrosGastos, file: file, line: line)
        XCTAssertEqual(row("UNICOMPRA")?.category, .mercado, file: file, line: line)

        let payment = parsed.rows.first { $0.kind == .payment }
        XCTAssertEqual(payment?.amount ?? 0, 1500, accuracy: 0.001, file: file, line: line)
        XCTAssertEqual(payment?.include, false, file: file, line: line)
        XCTAssertEqual(row("ANUIDADE")?.include, false, file: file, line: line)
        XCTAssertEqual(row("DESC AUTOMATICO")?.include, false, file: file, line: line)

        let claro = row("CLARO")
        XCTAssertEqual(claro?.installment, InvoiceImporter.Installment(number: 17, total: 21), file: file, line: line)
        XCTAssertEqual(claro?.date, date(2026, 9, 23), file: file, line: line)
        XCTAssertEqual(claro?.purchaseDate, date(2026, 4, 22), file: file, line: line)
        XCTAssertEqual(claro?.category, .contas, file: file, line: line)
        XCTAssertEqual(row("HOTEL")?.purchaseDate, date(2025, 11, 28), file: file, line: line)
        XCTAssertEqual(row("LEROY")?.date, date(2026, 9, 15), file: file, line: line)
        XCTAssertEqual(parsed.rows.filter { $0.title.hasPrefix("LANCHONETE") }.count, 2, file: file, line: line)
        XCTAssertEqual(Set(parsed.rows.map(\.ref)).count, parsed.rows.count, file: file, line: line)
    }

    func testParsesInvoiceText() throws {
        check(try InvoiceImporter.parse(text: Self.sampleText))
    }

    func testReadsInvoicePDFWithPDFKit() throws {
        let bundle = Bundle(for: Self.self)
        let url = try XCTUnwrap(
            bundle.url(forResource: "fatura-bb-exemplo", withExtension: "pdf")
                ?? bundle.url(forResource: "fatura-bb-exemplo", withExtension: "pdf", subdirectory: "Fixtures")
        )
        let text = try InvoiceImporter.extractText(from: try Data(contentsOf: url))
        check(try InvoiceImporter.parse(text: text))
    }

    @MainActor
    func testRemovesCardPaymentAndAvoidsDuplicates() throws {
        let container = try ModelContainer(
            for: Institution.self, Asset.self, BalanceSnapshot.self, Movement.self, CashTransaction.self,
            configurations: ModelConfiguration(UUID().uuidString, isStoredInMemoryOnly: true)
        )
        let context = ModelContext(container)
        // "Pagto cartão crédito" que veio do extrato da conta.
        let payment = CashTransaction(date: date(2026, 9, 8), amount: 1500, category: .cartao, note: "Pagto cartão crédito", ref: "extrato:x")
        let other = CashTransaction(date: date(2026, 6, 8), amount: 999, category: .cartao, note: "Pagto cartão crédito", ref: "extrato:y")
        context.insert(payment)
        context.insert(other)

        let parsed = try InvoiceImporter.parse(text: Self.sampleText)
        let all = try context.fetch(FetchDescriptor<CashTransaction>())
        let choices = InvoiceImporter.cardPayments(in: all, for: parsed)
        XCTAssertEqual(choices.count, 2)
        XCTAssertEqual(choices.first { $0.transaction.ref == "extrato:x" }?.suggested, true)
        XCTAssertEqual(choices.first { $0.transaction.ref == "extrato:y" }?.suggested, false)

        let result = InvoiceImporter.importRows(parsed.rows, removing: [payment], into: context)
        XCTAssertEqual(result.removed, 1)
        XCTAssertEqual(result.added, parsed.rows.filter(\.include).count)
        XCTAssertTrue(StatementImporter.cardItemized)
        let remaining = try context.fetch(FetchDescriptor<CashTransaction>())
        XCTAssertFalse(remaining.contains { $0.ref == "extrato:x" })
        let expenses = remaining.filter { !$0.isIncome && $0.ref.hasPrefix("fatura:") }.reduce(0) { $0 + $1.amount }
        XCTAssertEqual(expenses, 1371, accuracy: 0.001)

        XCTAssertEqual(InvoiceImporter.importRows(parsed.rows, removing: [], into: context).added, 0)

        // Próximo extrato: o pagamento da fatura vem desmarcado.
        let statement = try StatementImporter.parse(StatementImporterTests.sample)
        let prepared = StatementImporter.prepare(statement.rows, rules: [:], existingRefs: [])
        let card = try XCTUnwrap(prepared.first { $0.category == .cartao })
        XCTAssertFalse(card.include)
        XCTAssertTrue(card.isCardPayment)
    }
}
