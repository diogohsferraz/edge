import SwiftUI
import SwiftData

/// Texto de um extrato escolhido pelo usuário, para abrir a prévia em uma sheet.
struct StatementFile: Identifiable {
    let id = UUID()
    let text: String
}

/// Lê um arquivo escolhido no seletor de arquivos (inclui extratos em Latin-1, como os do BB).
func readPickedFile(_ result: Result<[URL], Error>) -> Result<String, Error> {
    switch result {
    case .failure(let error):
        return .failure(error)
    case .success(let urls):
        guard let url = urls.first else { return .failure(CocoaError(.fileNoSuchFile)) }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        do {
            return .success(CSVService.decodeText(try Data(contentsOf: url)))
        } catch {
            return .failure(error)
        }
    }
}

/// Lê um arquivo binário (PDF) escolhido no seletor de arquivos.
func readPickedData(_ result: Result<[URL], Error>) -> Result<Data, Error> {
    switch result {
    case .failure(let error):
        return .failure(error)
    case .success(let urls):
        guard let url = urls.first else { return .failure(CocoaError(.fileNoSuchFile)) }
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        return Result { try Data(contentsOf: url) }
    }
}

/// Prévia do extrato: o usuário confere as categorias antes de importar.
struct StatementImportView: View {
    let text: String
    var onImported: ((Int, Date?) -> Void)?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var transactions: [CashTransaction]
    @State private var parsed: StatementImporter.Parsed?
    @State private var rows: [StatementImporter.Row] = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ContentUnavailableView("Não foi possível ler o extrato", systemImage: "exclamationmark.triangle", description: Text(error))
                } else {
                    list
                }
            }
            .navigationTitle("Importar extrato")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Importar") { importSelected() }
                        .disabled(!rows.contains(where: \.include))
                }
            }
            .onAppear(perform: load)
        }
    }

    private var list: some View {
        let income = rows.filter { $0.include && $0.isIncome }.reduce(0) { $0 + $1.amount }
        let expense = rows.filter { $0.include && !$0.isIncome }.reduce(0) { $0 + $1.amount }
        return List {
            Section {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Entradas").font(.caption).foregroundStyle(.secondary)
                        Text(Fmt.currency(income)).font(.headline).foregroundStyle(.green).monospacedDigit()
                    }
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text("Saídas").font(.caption).foregroundStyle(.secondary)
                        Text(Fmt.currency(expense)).font(.headline).foregroundStyle(.red).monospacedDigit()
                    }
                }
                if let parsed {
                    Text("\(rows.filter(\.include).count) de \(rows.count) lançamentos selecionados · \(parsed.skippedBalance) linhas de saldo ignoradas · \(parsed.skippedInvestment) movimentações de investimento desmarcadas")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } footer: {
                Text("Confira as categorias. O app lembra o que você escolher para cada favorecido. Movimentações entre a conta e seus investimentos (BB Rende Fácil, poupança, Tesouro) vêm desmarcadas porque não são receita nem despesa.")
            }

            Section("Lançamentos") {
                ForEach($rows) { $row in
                    StatementRowView(row: $row)
                }
            }
        }
    }

    private func load() {
        guard parsed == nil, error == nil else { return }
        do {
            let p = try StatementImporter.parse(text)
            parsed = p
            let refs = Set(transactions.map(\.ref).filter { !$0.isEmpty })
            rows = StatementImporter.prepare(p.rows, rules: StatementImporter.loadRules(), existingRefs: refs)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func importSelected() {
        StatementImporter.saveRules(StatementImporter.learn(from: rows, rules: StatementImporter.loadRules()))
        let result = StatementImporter.importRows(rows, into: context)
        let last = rows.filter(\.include).map(\.date).max()
        onImported?(result.added, last)
        dismiss()
    }
}

private struct StatementRowView: View {
    @Binding var row: StatementImporter.Row

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Toggle("", isOn: $row.include)
                    .labelsHidden()
                    .toggleStyle(CheckboxToggleStyle())
                    .disabled(row.isDuplicate)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(row.title).font(.subheadline.weight(.medium)).lineLimit(1)
                        if row.isInvestment { tag("investimento") }
                        if row.isDuplicate { tag("já importado") }
                        if row.isRemembered { tag("lembrado") }
                        if row.isCardPayment { tag("fatura detalhada") }
                    }
                    if !row.details.isEmpty {
                        Text(row.details).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Text(Fmt.shortDay.string(from: row.date)).font(.caption2).foregroundStyle(.tertiary)
                }
                Spacer(minLength: 4)
                Text((row.isIncome ? "+" : "−") + Fmt.currency(row.amount))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(row.isIncome ? Color.green : Color.red)
            }
            if row.include {
                Picker("Categoria", selection: $row.category) {
                    ForEach(row.isIncome ? CashCategory.incomeCases : CashCategory.expenseCases) { c in
                        Label(c.title, systemImage: c.icon).tag(c)
                    }
                }
                .font(.subheadline)
            }
        }
        .opacity(row.include ? 1 : 0.5)
        .padding(.vertical, 2)
    }

    private func tag(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(Color.secondary.opacity(0.15), in: Capsule())
    }
}

/// Caixa de seleção (o Toggle padrão do iOS é um interruptor, grande demais para a lista).
struct CheckboxToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            Image(systemName: configuration.isOn ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(configuration.isOn ? Color.accentColor : Color.secondary)
        }
        .buttonStyle(.plain)
    }
}
