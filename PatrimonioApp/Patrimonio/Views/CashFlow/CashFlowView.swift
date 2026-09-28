import SwiftUI
import SwiftData
import Charts
import UniformTypeIdentifiers

/// Controle de receitas e despesas do mês (estilo Mobills / Organizze).
struct CashFlowView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \CashTransaction.date, order: .reverse) private var transactions: [CashTransaction]
    @Query(sort: \CustomCategory.createdAt) private var customCategories: [CustomCategory]
    @AppStorage("hideValues") private var hideValues = false
    @State private var month = Date().startOfMonth
    @State private var editing: CashTransaction?
    @State private var newIsIncome: Bool?
    @State private var pickerKind: PickerKind = .statement
    @State private var showPicker = false
    @State private var statementFile: StatementFile?
    @State private var invoiceFile: InvoiceFile?
    @State private var message: String?

    enum PickerKind { case statement, invoice }

    private var monthTransactions: [CashTransaction] {
        transactions.filter { $0.date.isSameMonth(as: month) }
    }

    private struct DaySection: Identifiable {
        var id: Date { day }
        let day: Date
        let items: [CashTransaction]
    }

    private struct CategorySlice: Identifiable {
        var id: String { info.key }
        let info: CategoryInfo
        /// Lançamentos direto na categoria-mãe durante o detalhamento por subcategoria.
        var isDirect = false
        let value: Double
    }

    private struct MonthBar: Identifiable {
        var id: String { "\(kind)-\(month.timeIntervalSince1970)" }
        let month: Date
        let kind: String
        let value: Double
    }

    // MARK: - Filtros (tudo na tela reage a eles)

    enum TypeFilter: String, CaseIterable, Identifiable {
        case all = "Tudo", expense = "Despesas", income = "Receitas"
        var id: String { rawValue }
    }

    @State private var typeFilter: TypeFilter = .all
    /// Chave da categoria (ou subcategoria) filtrada.
    @State private var categoryFilter: String?

    private var catalog: CategoryCatalog { CategoryCatalog(customCategories) }
    private var selectedInfo: CategoryInfo? { categoryFilter.map { catalog.lookup($0) } }

    /// Categoria principal que está "aberta" nas subcategorias (quando tem subcategorias).
    private var drillRoot: CategoryInfo? {
        guard let key = categoryFilter else { return nil }
        let root = catalog.root(key)
        return catalog.subcategories(of: root.key).isEmpty ? nil : root
    }
    @State private var dayFilter: Date?
    @State private var selectedAngle: Double?

    private var hasFilters: Bool { typeFilter != .all || categoryFilter != nil || dayFilter != nil }

    private func matches(_ t: CashTransaction, ignoreDay: Bool = false, ignoreCategory: Bool = false) -> Bool {
        if typeFilter == .income && !t.isIncome { return false }
        if typeFilter == .expense && t.isIncome { return false }
        if !ignoreCategory, let c = categoryFilter, !catalog.contains(t.categoryRaw, in: c) { return false }
        if !ignoreDay, let d = dayFilter, !Calendar.app.isDate(t.date, inSameDayAs: d) { return false }
        return true
    }

    private func setType(_ type: TypeFilter) {
        withAnimation(.snappy) {
            typeFilter = type
            if let c = selectedInfo, (type == .income && !c.isIncome) || (type == .expense && c.isIncome) { categoryFilter = nil }
        }
    }

    /// Tocar de novo numa subcategoria volta para a categoria principal.
    private func toggleCategory(_ key: String) {
        withAnimation(.snappy) { categoryFilter = categoryFilter == key ? catalog.lookup(key).parentKey : key }
    }

    private func toggleDay(_ d: Date) {
        withAnimation(.snappy) { dayFilter = dayFilter.map { Calendar.app.isDate($0, inSameDayAs: d) } == true ? nil : d }
    }

    private func changeMonth(to m: Date) {
        withAnimation(.snappy) {
            month = m.startOfMonth
            dayFilter = nil
        }
    }

    private func clearFilters() {
        withAnimation(.snappy) {
            typeFilter = .all
            categoryFilter = nil
            dayFilter = nil
        }
    }

    /// A rosca mostra receitas quando o filtro é de receitas (ou a categoria escolhida é de receita).
    private var donutIsIncome: Bool { typeFilter == .income || (selectedInfo?.isIncome ?? false) }

    var body: some View {
        NavigationStack {
            let items = monthTransactions
            let income = items.filter(\.isIncome).reduce(0) { $0 + $1.amount }
            let expense = items.filter { !$0.isIncome }.reduce(0) { $0 + $1.amount }
            let balance = income - expense
            let filtered = items.filter { matches($0) }

            List {
                Section {
                    monthSelector
                    summary(income: income, expense: expense, balance: balance, items: items)
                    if hasFilters { filterChips }
                } footer: {
                    if !hasFilters { Text("Toque nos totais, nos gráficos ou nas categorias para filtrar.") }
                }

                Section {
                    Picker("Tipo", selection: Binding(get: { typeFilter }, set: { setType($0) })) {
                        ForEach(TypeFilter.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    categoryChart(items)
                } header: {
                    Text((drillRoot.map { $0.title + " por subcategoria" } ?? ((donutIsIncome ? "Receitas" : "Gastos") + " por categoria")) + (dayFilter.map { " · " + Fmt.shortDay.string(from: $0) } ?? ""))
                }

                Section {
                    historyChart
                } header: {
                    Text("Últimos 6 meses" + (categoryFilter.map { " · " + catalog.label($0) } ?? ""))
                } footer: {
                    Text("Toque num mês para abri-lo.")
                }

                Section {
                    dailyChart(items)
                } header: {
                    Text((categoryFilter.map { catalog.label($0) } ?? (typeFilter == .income ? "Receitas" : "Despesas")) + " por dia")
                } footer: {
                    Text("Toque num dia para ver só os lançamentos dele.")
                }

                Section {
                    HStack {
                        Text(hasFilters ? "Lançamentos filtrados" : "Lançamentos").font(.headline)
                        Spacer()
                        Text("\(filtered.count) · " + Fmt.signedCurrency(filtered.reduce(0) { $0 + ($1.isIncome ? $1.amount : -$1.amount) }, hidden: hideValues))
                            .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                    }
                }

                ForEach(daySections(filtered)) { section in
                    Section {
                        ForEach(section.items) { t in
                            TransactionRow(
                                transaction: t,
                                info: catalog.lookup(t.categoryRaw, isIncome: t.isIncome),
                                label: catalog.label(t.categoryRaw),
                                hidden: hideValues,
                                highlighted: categoryFilter == t.categoryRaw
                            ) {
                                toggleCategory(t.categoryRaw)
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { editing = t }
                        }
                        .onDelete { offsets in
                            offsets.map { section.items[$0] }.forEach { context.delete($0) }
                        }
                    } header: {
                        Button { toggleDay(section.day) } label: {
                            HStack {
                                Text(Fmt.day.string(from: section.day))
                                if dayFilter != nil { Image(systemName: "xmark.circle.fill") }
                            }
                        }
                        .buttonStyle(.borderless)
                    }
                }

                if filtered.isEmpty {
                    Section {
                        Text(hasFilters ? "Nenhum lançamento com esses filtros." : "Nenhum lançamento neste mês. Toque em + para registrar receitas e despesas.")
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
                        Button { pickerKind = .statement; showPicker = true } label: { Label("Importar extrato (CSV)", systemImage: "doc.text.magnifyingglass") }
                        Button { pickerKind = .invoice; showPicker = true } label: { Label("Importar fatura do cartão (PDF)", systemImage: "creditcard") }
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(item: $editing) { TransactionFormView(transaction: $0, isIncome: $0.isIncome) }
            .fileImporter(
                isPresented: $showPicker,
                allowedContentTypes: pickerKind == .invoice ? [.pdf] : [.commaSeparatedText, .plainText, .text]
            ) { result in
                if pickerKind == .invoice {
                    switch readPickedData(result.map { [$0] }) {
                    case .success(let data): invoiceFile = InvoiceFile(data: data)
                    case .failure(let error): message = error.localizedDescription
                    }
                } else {
                    switch readPickedFile(result.map { [$0] }) {
                    case .success(let text): statementFile = StatementFile(text: text)
                    case .failure(let error): message = error.localizedDescription
                    }
                }
            }
            .sheet(item: $statementFile) { file in
                StatementImportView(text: file.text) { added, last in
                    if let last { month = last.startOfMonth }
                    message = "\(added) lançamento(s) importado(s)."
                }
            }
            .sheet(item: $invoiceFile) { file in
                InvoiceImportView(data: file.data) { text, last in
                    if let last { month = last.startOfMonth }
                    message = text
                }
            }
            .alert("Importação", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
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
            Button { changeMonth(to: month.addingMonths(-1)) } label: { Image(systemName: "chevron.left") }
            Spacer()
            Text(Fmt.monthYear.string(from: month).capitalized).font(.headline)
            Spacer()
            Button { changeMonth(to: month.addingMonths(1)) } label: { Image(systemName: "chevron.right") }
        }
        .buttonStyle(.borderless)
    }

    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if typeFilter != .all {
                    chip(typeFilter.rawValue, color: typeFilter == .income ? .green : .red) { setType(.all) }
                }
                if let key = categoryFilter {
                    chip(catalog.label(key), color: catalog.lookup(key).color) {
                        withAnimation(.snappy) { categoryFilter = catalog.lookup(key).parentKey }
                    }
                }
                if let d = dayFilter {
                    chip("Dia " + Fmt.shortDay.string(from: d), color: .accentColor) { toggleDay(d) }
                }
                Button("Limpar", action: clearFilters)
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderless)
            }
        }
    }

    private func chip(_ title: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Circle().fill(color).frame(width: 7, height: 7)
                Text(title)
                Image(systemName: "xmark").font(.caption2.weight(.bold))
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.accentColor.opacity(0.15), in: Capsule())
        }
        .buttonStyle(.borderless)
    }

    private func summary(income: Double, expense: Double, balance: Double, items: [CashTransaction]) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                summaryTile("Receitas", income, .green, selected: typeFilter == .income) { setType(typeFilter == .income ? .all : .income) }
                summaryTile("Despesas", expense, .red, selected: typeFilter == .expense) { setType(typeFilter == .expense ? .all : .expense) }
                summaryTile("Saldo", balance, balance >= 0 ? .blue : .red, selected: false) { clearFilters() }
            }
            if let key = categoryFilter {
                let c = catalog.lookup(key)
                let value = items.filter { catalog.contains($0.categoryRaw, in: key) }.reduce(0) { $0 + $1.amount }
                let base = c.isIncome ? income : expense
                HStack {
                    Image(systemName: c.icon).foregroundStyle(c.color)
                    Text(catalog.label(key)).font(.subheadline.weight(.medium))
                    Spacer()
                    Text(Fmt.currency(value, hidden: hideValues)).font(.subheadline.weight(.semibold)).monospacedDigit()
                    if base > 0 {
                        Text(Fmt.percent(value / base)).font(.caption).foregroundStyle(.secondary)
                    }
                }
            } else if income > 0 {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Taxa de poupança").font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        Text(Fmt.percent(balance / income)).font(.caption.weight(.semibold))
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

    private func summaryTile(_ title: String, _ value: Double, _ color: Color, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(Fmt.currency(value, hidden: hideValues))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(color)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
            .background(selected ? Color.accentColor.opacity(0.15) : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Color.accentColor : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.borderless)
    }

    private func slices(_ items: [CashTransaction]) -> [CategorySlice] {
        let source = items.filter { t in
            t.isIncome == donutIsIncome && (dayFilter.map { Calendar.app.isDate(t.date, inSameDayAs: $0) } ?? true)
        }
        let cat = catalog
        // Detalhamento: só a categoria aberta, separada por subcategoria.
        if let drill = drillRoot {
            return Dictionary(grouping: source.filter { cat.contains($0.categoryRaw, in: drill.key) }) { $0.categoryRaw }
                .map { key, list in
                    let info = cat.lookup(key)
                    let direct = key == drill.key
                    let shown = direct ? CategoryInfo(key: info.key, title: info.title + " (sem subcategoria)", icon: info.icon, colorHex: info.colorHex, isIncome: info.isIncome, parentKey: nil, isBuiltin: info.isBuiltin) : info
                    return CategorySlice(info: shown, isDirect: direct, value: list.reduce(0) { $0 + $1.amount })
                }
                .sorted { $0.value > $1.value }
        }
        return Dictionary(grouping: source) { cat.root($0.categoryRaw).key }
            .map { CategorySlice(info: cat.lookup($0.key), value: $0.value.reduce(0) { $0 + $1.amount }) }
            .sorted { $0.value > $1.value }
    }

    private func isHighlighted(_ s: CategorySlice) -> Bool {
        categoryFilter == s.info.key && drillRoot?.key != categoryFilter
    }

    private func isDimmed(_ s: CategorySlice) -> Bool {
        guard let key = categoryFilter else { return false }
        if let drill = drillRoot, key == drill.key { return false } // categoria aberta: nada esmaecido
        return key != s.info.key
    }

    private func categoryChart(_ items: [CashTransaction]) -> some View {
        let data = slices(items)
        let total = data.reduce(0) { $0 + $1.value }

        return VStack(spacing: 12) {
            if let drill = drillRoot {
                Button {
                    withAnimation(.snappy) { categoryFilter = nil }
                } label: {
                    Label("Voltar para todas as categorias", systemImage: "chevron.left")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityHint("Sai do detalhamento de \(drill.title)")
            }
            if data.isEmpty {
                Text("Nenhum lançamento " + (donutIsIncome ? "de receita" : "de despesa") + " neste período.")
                    .font(.callout).foregroundStyle(.secondary)
            } else {
                Chart(data) { s in
                    SectorMark(
                        angle: .value("Valor", s.value),
                        innerRadius: .ratio(0.6),
                        outerRadius: .ratio(isHighlighted(s) ? 1 : 0.9),
                        angularInset: 1.5
                    )
                    .cornerRadius(3)
                    .foregroundStyle(s.info.color)
                    .opacity(isDimmed(s) ? 0.3 : 1)
                }
                .chartAngleSelection(value: $selectedAngle)
                .onChange(of: selectedAngle) { _, angle in
                    // Toque numa fatia: descobre a categoria pelo ângulo acumulado.
                    guard let angle else { return }
                    var acc = 0.0
                    for s in data {
                        acc += s.value
                        if angle <= acc { toggleCategory(s.info.key); break }
                    }
                    selectedAngle = nil
                }
                .frame(height: 190)

                ForEach(data) { s in
                    Button { toggleCategory(s.info.key) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: s.info.icon)
                                .foregroundStyle(s.info.color)
                                .frame(width: 22)
                            Text(s.info.title).font(.subheadline).foregroundStyle(.primary)
                            if drillRoot == nil, !catalog.subcategories(of: s.info.key).isEmpty {
                                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                            }
                            Spacer()
                            Text(Fmt.currency(s.value, hidden: hideValues)).font(.subheadline).monospacedDigit().foregroundStyle(.primary)
                            Text(Fmt.percent(total > 0 ? s.value / total : 0))
                                .font(.caption).foregroundStyle(.secondary)
                                .frame(width: 56, alignment: .trailing)
                        }
                        .padding(.vertical, 4)
                        .padding(.horizontal, 6)
                        .background(isHighlighted(s) ? Color.accentColor.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 8))
                        .opacity(isDimmed(s) ? 0.45 : 1)
                    }
                    .buttonStyle(.borderless)
                }
            }
        }
        .padding(.vertical, 6)
    }

    private var historyChart: some View {
        let months = (0..<6).reversed().map { month.addingMonths(-$0) }
        let bars = months.flatMap { m -> [MonthBar] in
            let list = transactions.filter { $0.date.isSameMonth(as: m) }
            if let key = categoryFilter {
                return [MonthBar(month: m, kind: catalog.label(key), value: list.filter { catalog.contains($0.categoryRaw, in: key) }.reduce(0) { $0 + $1.amount })]
            }
            var out: [MonthBar] = []
            if typeFilter != .expense { out.append(MonthBar(month: m, kind: "Receitas", value: list.filter(\.isIncome).reduce(0) { $0 + $1.amount })) }
            if typeFilter != .income { out.append(MonthBar(month: m, kind: "Despesas", value: list.filter { !$0.isIncome }.reduce(0) { $0 + $1.amount })) }
            return out
        }
        var scale: KeyValuePairs<String, Color> = ["Receitas": Color.green, "Despesas": Color.red]
        if let key = categoryFilter { scale = [catalog.label(key): catalog.lookup(key).color] }
        return Chart(bars) { b in
            BarMark(x: .value("Mês", b.month, unit: .month), y: .value("Valor", b.value))
                .foregroundStyle(by: .value("Tipo", b.kind))
                .position(by: .value("Tipo", b.kind))
                .cornerRadius(3)
                .opacity(b.month.isSameMonth(as: month) ? 1 : 0.4)
        }
        .chartForegroundStyleScale(scale)
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
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .onTapGesture { location in
                        guard let plot = proxy.plotFrame else { return }
                        let x = location.x - geo[plot].origin.x
                        if let date: Date = proxy.value(atX: x) { changeMonth(to: date) }
                    }
            }
        }
        .chartLegend(position: .bottom, alignment: .leading)
        .frame(height: 180)
        .padding(.vertical, 6)
    }

    private struct DayBar: Identifiable {
        var id: Date { day }
        let day: Date
        let value: Double
    }

    private func dailyChart(_ items: [CashTransaction]) -> some View {
        let showIncome = typeFilter == .income || (selectedInfo?.isIncome ?? false)
        let color = selectedInfo?.color ?? (showIncome ? Color.green : Color.red)
        let source = items.filter { t in
            if categoryFilter == nil && typeFilter == .all { return !t.isIncome }
            return matches(t, ignoreDay: true)
        }
        let byDay = Dictionary(grouping: source) { Calendar.app.startOfDay(for: $0.date) }
        let bars = byDay.map { DayBar(day: $0.key, value: $0.value.reduce(0) { $0 + $1.amount }) }.sorted { $0.day < $1.day }
        let selected = dayFilter.map { Calendar.app.startOfDay(for: $0) }

        return Group {
            if bars.isEmpty {
                Text("Sem lançamentos neste mês.").font(.callout).foregroundStyle(.secondary)
            } else {
                Chart(bars) { b in
                    BarMark(x: .value("Dia", b.day, unit: .day), y: .value("Valor", b.value))
                        .foregroundStyle(color)
                        .opacity(selected == nil || selected == b.day ? 1 : 0.3)
                        .cornerRadius(2)
                }
                .chartXScale(domain: month.startOfMonth...month.endOfMonth)
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) { Text(hideValues ? "" : Fmt.compactCurrency(v)) }
                        }
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .day, count: 5)) { _ in
                        AxisValueLabel(format: .dateTime.day())
                    }
                }
                .chartOverlay { proxy in
                    GeometryReader { geo in
                        Rectangle().fill(.clear).contentShape(Rectangle())
                            .onTapGesture { location in
                                guard let plot = proxy.plotFrame else { return }
                                let x = location.x - geo[plot].origin.x
                                guard let date: Date = proxy.value(atX: x) else { return }
                                // Só filtra se houver lançamento naquele dia.
                                let day = Calendar.app.startOfDay(for: date)
                                if bars.contains(where: { $0.day == day }) { toggleDay(day) }
                            }
                    }
                }
                .frame(height: 140)
                .padding(.vertical, 6)
            }
        }
    }

    private func daySections(_ items: [CashTransaction]) -> [DaySection] {
        Dictionary(grouping: items) { Calendar.app.startOfDay(for: $0.date) }
            .map { DaySection(day: $0.key, items: $0.value.sorted { $0.amount > $1.amount }) }
            .sorted { $0.day > $1.day }
    }
}

private struct TransactionRow: View {
    let transaction: CashTransaction
    let info: CategoryInfo
    let label: String
    let hidden: Bool
    var highlighted = false
    /// Toque na etiqueta da categoria: filtra o Orçamento por ela.
    var onCategoryTap: () -> Void = {}

    var body: some View {
        HStack(spacing: 12) {
            IconBadge(systemName: info.icon, color: info.color, size: 32)
            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.note.isEmpty ? label : transaction.note)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Button(action: onCategoryTap) {
                    HStack(spacing: 4) {
                        Circle().fill(info.color).frame(width: 6, height: 6)
                        Text(label)
                    }
                    .font(.caption)
                    .foregroundStyle(highlighted ? Color.accentColor : .secondary)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(highlighted ? Color.accentColor.opacity(0.15) : Color(.tertiarySystemFill), in: Capsule())
                }
                .buttonStyle(.borderless)
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

    @Query(sort: \CustomCategory.createdAt) private var customCategories: [CustomCategory]
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var isIncome: Bool
    @State private var amount = ""
    /// Chave da categoria (padrão ou personalizada).
    @State private var category: String
    @State private var date: Date
    @State private var note = ""
    @State private var loaded = false

    init(transaction: CashTransaction?, isIncome: Bool, defaultDate: Date = Date()) {
        self.transaction = transaction
        _isIncome = State(initialValue: isIncome)
        _category = State(initialValue: isIncome ? CashCategory.salario.rawValue : CashCategory.mercado.rawValue)
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
                        if CategoryCatalog(customCategories).lookup(category).isIncome != income {
                            category = income ? CashCategory.salario.rawValue : CashCategory.mercado.rawValue
                        }
                    }
                    CurrencyField("0,00", text: $amount)
                        .font(.title2.weight(.semibold))
                }
                Section {
                    CategoryPicker(isIncome: isIncome, selection: $category)
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
                    category = transaction.categoryRaw
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
            transaction.categoryRaw = category
            transaction.isIncome = isIncome
            transaction.date = date.noon
            transaction.note = note
        } else {
            context.insert(CashTransaction(date: date.noon, amount: abs(value), categoryKey: category, isIncome: isIncome, note: note))
        }
        try? context.save()
        dismiss()
    }
}
