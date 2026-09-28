import SwiftUI
import SwiftData
import Charts
import UniformTypeIdentifiers

/// Controle de receitas e despesas do mês (estilo Mobills / Organizze).
struct CashFlowView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \CashTransaction.date, order: .reverse) private var transactions: [CashTransaction]
    @AppStorage("hideValues") private var hideValues = false
    @State private var month = Date().startOfMonth
    @State private var editing: CashTransaction?
    @State private var newIsIncome: Bool?
    @State private var showStatementPicker = false
    @State private var statementFile: StatementFile?
    @State private var message: String?

    private var monthTransactions: [CashTransaction] {
        transactions.filter { $0.date.isSameMonth(as: month) }
    }

    private struct DaySection: Identifiable {
        var id: Date { day }
        let day: Date
        let items: [CashTransaction]
    }

    private struct CategorySlice: Identifiable {
        var id: String { category.rawValue }
        let category: CashCategory
        let value: Double
    }

    private struct MonthBar: Identifiable {
        var id: String { "\(kind)-\(month.timeIntervalSince1970)" }
        let month: Date
        let kind: String
        let value: Double
    }

    var body: some View {
        NavigationStack {
            let items = monthTransactions
            let income = items.filter(\.isIncome).reduce(0) { $0 + $1.amount }
            let expense = items.filter { !$0.isIncome }.reduce(0) { $0 + $1.amount }
            let balance = income - expense

            List {
                Section {
                    monthSelector
                    summary(income: income, expense: expense, balance: balance)
                }

                if expense > 0 {
                    Section("Gastos por categoria") {
                        categoryChart(items)
                    }
                }

                Section("Últimos 6 meses") {
                    historyChart
                }

                ForEach(daySections(items)) { section in
                    Section(Fmt.day.string(from: section.day)) {
                        ForEach(section.items) { t in
                            Button { editing = t } label: { TransactionRow(transaction: t, hidden: hideValues) }
                                .buttonStyle(.plain)
                        }
                        .onDelete { offsets in
                            offsets.map { section.items[$0] }.forEach { context.delete($0) }
                        }
                    }
                }

                if items.isEmpty {
                    Section {
                        Text("Nenhum lançamento neste mês. Toque em + para registrar receitas e despesas.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Orçamento")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { newIsIncome = false } label: { Label("Nova despesa", systemImage: "minus.circle") }
                        Button { newIsIncome = true } label: { Label("Nova receita", systemImage: "plus.circle") }
                        Divider()
                        Button { showStatementPicker = true } label: { Label("Importar extrato (CSV)", systemImage: "doc.text.magnifyingglass") }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(item: $editing) { TransactionFormView(transaction: $0, isIncome: $0.isIncome) }
            .fileImporter(isPresented: $showStatementPicker, allowedContentTypes: [.commaSeparatedText, .plainText, .text]) { result in
                switch readPickedFile(result.map { [$0] }) {
                case .success(let text): statementFile = StatementFile(text: text)
                case .failure(let error): message = error.localizedDescription
                }
            }
            .sheet(item: $statementFile) { file in
                StatementImportView(text: file.text) { added, last in
                    if let last { month = last.startOfMonth }
                    message = "\(added) lançamento(s) importado(s)."
                }
            }
            .alert("Extrato", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(message ?? "")
            }
            .sheet(isPresented: Binding(get: { newIsIncome != nil }, set: { if !$0 { newIsIncome = nil } })) {
                TransactionFormView(transaction: nil, isIncome: newIsIncome ?? false, defaultDate: month.isSameMonth(as: Date()) ? Date() : month)
            }
        }
    }

    private var monthSelector: some View {
        HStack {
            Button { month = month.addingMonths(-1) } label: { Image(systemName: "chevron.left") }
            Spacer()
            Text(Fmt.monthYear.string(from: month).capitalized).font(.headline)
            Spacer()
            Button { month = month.addingMonths(1) } label: { Image(systemName: "chevron.right") }
        }
        .buttonStyle(.borderless)
    }

    private func summary(income: Double, expense: Double, balance: Double) -> some View {
        VStack(spacing: 12) {
            HStack {
                summaryItem("Receitas", income, .green)
                Spacer()
                summaryItem("Despesas", expense, .red)
                Spacer()
                summaryItem("Saldo", balance, balance >= 0 ? .blue : .red)
            }
            if income > 0 {
                let rate = balance / income
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Taxa de poupança").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Text(Fmt.percent(rate)).font(.caption.weight(.semibold))
                    }
                    ProgressView(value: min(max(expense / income, 0), 1))
                        .tint(expense > income ? Color.red : Color.orange)
                    Text("Você gastou \(Fmt.percent(expense / income)) do que recebeu.")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func summaryItem(_ title: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(Fmt.currency(value, hidden: hideValues))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(color)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
    }

    private func categoryChart(_ items: [CashTransaction]) -> some View {
        let grouped = Dictionary(grouping: items.filter { !$0.isIncome }) { $0.category }
        let slices = grouped.map { CategorySlice(category: $0.key, value: $0.value.reduce(0) { $0 + $1.amount }) }
            .sorted { $0.value > $1.value }
        let total = slices.reduce(0) { $0 + $1.value }

        return VStack(spacing: 12) {
            Chart(slices) { s in
                SectorMark(angle: .value("Valor", s.value), innerRadius: .ratio(0.6), angularInset: 1.5)
                    .cornerRadius(3)
                    .foregroundStyle(s.category.color)
            }
            .frame(height: 180)

            ForEach(slices) { s in
                HStack(spacing: 10) {
                    Image(systemName: s.category.icon)
                        .foregroundStyle(s.category.color)
                        .frame(width: 22)
                    Text(s.category.title).font(.subheadline)
                    Spacer()
                    Text(Fmt.currency(s.value, hidden: hideValues)).font(.subheadline).monospacedDigit()
                    Text(Fmt.percent(total > 0 ? s.value / total : 0))
                        .font(.caption).foregroundStyle(.secondary)
                        .frame(width: 56, alignment: .trailing)
                }
            }
        }
        .padding(.vertical, 6)
    }

    private var historyChart: some View {
        let months = (0..<6).reversed().map { month.addingMonths(-$0) }
        let bars = months.flatMap { m -> [MonthBar] in
            let list = transactions.filter { $0.date.isSameMonth(as: m) }
            return [
                MonthBar(month: m, kind: "Receitas", value: list.filter(\.isIncome).reduce(0) { $0 + $1.amount }),
                MonthBar(month: m, kind: "Despesas", value: list.filter { !$0.isIncome }.reduce(0) { $0 + $1.amount }),
            ]
        }
        return Chart(bars) { b in
            BarMark(x: .value("Mês", b.month, unit: .month), y: .value("Valor", b.value))
                .foregroundStyle(by: .value("Tipo", b.kind))
                .position(by: .value("Tipo", b.kind))
                .cornerRadius(3)
        }
        .chartForegroundStyleScale(["Receitas": Color.green, "Despesas": Color.red])
        .chartYAxis {
            AxisMarks(position: .leading) { value in
                AxisGridLine()
                AxisValueLabel {
                    if let v = value.as(Double.self) { Text(hideValues ? "" : Fmt.compactCurrency(v)) }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .stride(by: .month)) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated), centered: true)
            }
        }
        .chartLegend(position: .bottom, alignment: .leading)
        .frame(height: 180)
        .padding(.vertical, 6)
    }

    private func daySections(_ items: [CashTransaction]) -> [DaySection] {
        Dictionary(grouping: items) { Calendar.app.startOfDay(for: $0.date) }
            .map { DaySection(day: $0.key, items: $0.value.sorted { $0.amount > $1.amount }) }
            .sorted { $0.day > $1.day }
    }
}

private struct TransactionRow: View {
    let transaction: CashTransaction
    let hidden: Bool

    var body: some View {
        HStack(spacing: 12) {
            IconBadge(systemName: transaction.category.icon, color: transaction.category.color, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(transaction.note.isEmpty ? transaction.category.title : transaction.note)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(transaction.category.title).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text((transaction.isIncome ? "+" : "−") + Fmt.currency(transaction.amount, hidden: hidden).replacingOccurrences(of: "-", with: ""))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(transaction.isIncome ? Color.green : Color.primary)
        }
        .contentShape(Rectangle())
    }
}

struct TransactionFormView: View {
    let transaction: CashTransaction?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var isIncome: Bool
    @State private var amount = ""
    @State private var category: CashCategory
    @State private var date: Date
    @State private var note = ""
    @State private var loaded = false

    init(transaction: CashTransaction?, isIncome: Bool, defaultDate: Date = Date()) {
        self.transaction = transaction
        _isIncome = State(initialValue: isIncome)
        _category = State(initialValue: isIncome ? .salario : .mercado)
        _date = State(initialValue: defaultDate)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Tipo", selection: $isIncome) {
                        Text("Despesa").tag(false)
                        Text("Receita").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: isIncome) { _, income in
                        if category.isIncome != income { category = income ? .salario : .mercado }
                    }
                    CurrencyField("0,00", text: $amount)
                        .font(.title2.weight(.semibold))
                }
                Section {
                    Picker("Categoria", selection: $category) {
                        ForEach(isIncome ? CashCategory.incomeCases : CashCategory.expenseCases) { c in
                            Label(c.title, systemImage: c.icon).tag(c)
                        }
                    }
                    DatePicker("Data", selection: $date, displayedComponents: .date)
                    TextField("Descrição", text: $note)
                }
                if transaction != nil {
                    Section {
                        Button("Excluir lançamento", role: .destructive) {
                            if let transaction { context.delete(transaction) }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle(transaction == nil ? (isIncome ? "Nova receita" : "Nova despesa") : "Editar lançamento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar", action: save)
                        .disabled((Fmt.parseNumber(amount) ?? 0) <= 0)
                }
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                if let transaction {
                    amount = Fmt.editable(transaction.amount)
                    category = transaction.category
                    date = transaction.date
                    note = transaction.note
                }
            }
        }
    }

    private func save() {
        guard let value = Fmt.parseNumber(amount), value > 0 else { return }
        if let transaction {
            transaction.amount = abs(value)
            transaction.category = category
            transaction.date = date.noon
            transaction.note = note
        } else {
            context.insert(CashTransaction(date: date.noon, amount: abs(value), category: category, note: note))
        }
        try? context.save()
        dismiss()
    }
}
