import SwiftUI
import SwiftData

struct InvoiceFile: Identifiable {
    let id = UUID()
    let data: Data
}

/// Prévia da fatura do cartão: compras por categoria e remoção do pagamento da fatura já lançado.
struct InvoiceImportView: View {
    let data: Data
    var onImported: ((String, Date?) -> Void)?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var transactions: [CashTransaction]
    @State private var parsed: InvoiceImporter.Parsed?
    @State private var rows: [InvoiceImporter.Row] = []
    @State private var payments: [PaymentChoice] = []
    @State private var error: String?

    struct PaymentChoice: Identifiable {
        var id: PersistentIdentifier { transaction.persistentModelID }
        let transaction: CashTransaction
        var remove: Bool
    }

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ContentUnavailableView("Não foi possível ler a fatura", systemImage: "exclamationmark.triangle", description: Text(error))
                } else if let parsed {
                    list(parsed.info)
                } else {
                    ProgressView("Lendo a fatura…")
                }
            }
            .navigationTitle("Importar fatura")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Importar") { importSelected() }
                        .disabled(parsed == nil || !rows.contains(where: \.include))
                }
            }
            .task { load() }
        }
    }

    private func list(_ info: InvoiceImporter.Info) -> some View {
        let selected = rows.filter(\.include).reduce(0) { $0 + ($1.isIncome ? -$1.amount : $1.amount) }
        let matches = info.total.map { abs($0 - selected) < 0.01 } ?? false
        return List {
            Section {
                LabeledContent("Cartão", value: info.issuer + (info.card.isEmpty ? "" : " final \(info.card)"))
                if let closing = info.closing { LabeledContent("Fechamento", value: Fmt.day.string(from: closing)) }
                if let due = info.due { LabeledContent("Vencimento", value: Fmt.day.string(from: due)) }
                if let total = info.total { LabeledContent("Total da fatura", value: Fmt.currency(total)) }
                LabeledContent("Selecionado") {
                    HStack(spacing: 4) {
                        Text(Fmt.currency(selected)).monospacedDigit()
                        if info.total != nil {
                            Image(systemName: matches ? "checkmark.circle.fill" : "exclamationmark.circle")
                                .foregroundStyle(matches ? Color.green : Color.orange)
                        }
                    }
                }
            } footer: {
                Text("As compras vão para as categorias de despesa. Para não contar o mesmo gasto duas vezes, o pagamento da fatura deixa de ser despesa: contam as compras detalhadas. Parcelas entram no mês desta fatura; estornos que anulam uma cobrança vêm desmarcados.")
            }

            if !payments.isEmpty {
                Section {
                    ForEach($payments) { $p in
                        Toggle(isOn: $p.remove) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.transaction.note.isEmpty ? "Fatura do cartão" : p.transaction.note).font(.subheadline).lineLimit(1)
                                Text("\(Fmt.day.string(from: p.transaction.date)) · \(Fmt.currency(p.transaction.amount))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Remover pagamentos de fatura já lançados")
                } footer: {
                    Text("Vieram do extrato da conta. Os que batem com o valor desta fatura ou do saldo anterior já vêm marcados.")
                }
            }

            Section("Lançamentos") {
                ForEach($rows) { $row in
                    InvoiceRowView(row: $row)
                }
            }
        }
    }

    private func load() {
        guard parsed == nil, error == nil else { return }
        do {
            let text = try InvoiceImporter.extractText(from: data)
            let p = try InvoiceImporter.parse(text: text)
            let refs = Set(transactions.map(\.ref).filter { !$0.isEmpty })
            rows = InvoiceImporter.prepare(p.rows, rules: StatementImporter.loadRules(), existingRefs: refs)
            payments = InvoiceImporter.cardPayments(in: transactions, for: p).map { PaymentChoice(transaction: $0.transaction, remove: $0.suggested) }
            parsed = p
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func importSelected() {
        StatementImporter.saveRules(InvoiceImporter.learn(from: rows, rules: StatementImporter.loadRules()))
        let remove = payments.filter(\.remove).map(\.transaction)
        let result = InvoiceImporter.importRows(rows, removing: remove, into: context)
        var message = "\(result.added) lançamento(s) da fatura importado(s)."
        if result.removed > 0 { message += " \(result.removed) pagamento(s) de fatura removido(s)." }
        if result.duplicates > 0 { message += " \(result.duplicates) já existiam." }
        onImported?(message, rows.filter(\.include).map(\.date).max())
        dismiss()
    }
}

private struct InvoiceRowView: View {
    @Binding var row: InvoiceImporter.Row

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Toggle("", isOn: $row.include)
                    .labelsHidden()
                    .toggleStyle(CheckboxToggleStyle())
                    .disabled(row.isDuplicate)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).font(.subheadline.weight(.medium)).lineLimit(1)
                    HStack(spacing: 4) {
                        ForEach(row.tags, id: \.self) { tag($0) }
                        if row.isDuplicate { tag("já importado") }
                        if row.isRemembered { tag("lembrado") }
                    }
                    Text(subtitle).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text((row.isIncome ? "+" : "−") + Fmt.currency(row.amount))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(row.isIncome ? Color.green : Color.red)
            }
            if row.include && row.kind == .purchase {
                Picker("Categoria", selection: $row.category) {
                    ForEach(CashCategory.expenseCases) { c in
                        Label(c.title, systemImage: c.icon).tag(c)
                    }
                }
                .font(.subheadline)
            }
        }
        .opacity(row.include ? 1 : 0.5)
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        if let i = row.installment {
            return "Parcela \(i.number)/\(i.total) · compra em \(Fmt.day.string(from: row.purchaseDate))"
        }
        let section = row.section.isEmpty ? "" : " · " + row.section.prefix(1).uppercased() + row.section.dropFirst()
        return Fmt.shortDay.string(from: row.date) + section
    }

    private func tag(_ text: String) -> some View {
        Text(text)
            .font(.caption2)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(Color.secondary.opacity(0.15), in: Capsule())
    }
}
