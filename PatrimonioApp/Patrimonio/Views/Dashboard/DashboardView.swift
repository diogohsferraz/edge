import SwiftUI
import SwiftData
import Charts

struct DashboardView: View {
    @Binding var selectedTab: AppTab

    @Environment(\.modelContext) private var context
    @Query(sort: \Asset.name) private var assets: [Asset]
    @EnvironmentObject private var benchmarks: BenchmarkStore
    @AppStorage("hideValues") private var hideValues = false
    @AppStorage("goalValue") private var goalValue: Double = 0
    @State private var showNewAsset = false

    var body: some View {
        NavigationStack {
            ScrollView {
                if assets.isEmpty {
                    EmptyDashboard(
                        onAdd: { showNewAsset = true },
                        onImport: { selectedTab = .settings },
                        onSample: { SampleData.load(into: context) }
                    )
                    .padding()
                } else {
                    let analytics = PortfolioAnalytics(assets: assets.map(\.analyticsInput))
                    VStack(spacing: 16) {
                        SummaryCard(analytics: analytics, hidden: hideValues)
                        if goalValue > 0 {
                            GoalCard(analytics: analytics, goal: goalValue, hidden: hideValues)
                        }
                        EvolutionCard(analytics: analytics, hidden: hideValues)
                        AllocationCard(analytics: analytics, hidden: hideValues)
                        PerformanceCard(analytics: analytics, benchmarks: benchmarks, hidden: hideValues)
                        ContributionsCard(analytics: analytics, hidden: hideValues)
                        InstitutionsCard(analytics: analytics, hidden: hideValues)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Patrimônio")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        withAnimation { hideValues.toggle() }
                    } label: {
                        Image(systemName: hideValues ? "eye.slash" : "eye")
                    }
                    .accessibilityLabel(hideValues ? "Mostrar valores" : "Ocultar valores")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        selectedTab = .update
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                    .accessibilityLabel("Atualizar saldos")
                }
            }
            .sheet(isPresented: $showNewAsset) {
                AssetFormView(asset: nil)
            }
        }
    }
}

// MARK: - Estado vazio

private struct EmptyDashboard: View {
    let onAdd: () -> Void
    let onImport: () -> Void
    let onSample: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "chart.pie.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
                .padding(.top, 40)
            Text("Todo o seu patrimônio em um só lugar")
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text("Cadastre seus investimentos de todos os bancos e corretoras, atualize os saldos uma vez por mês e acompanhe a evolução com gráficos.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            VStack(spacing: 12) {
                Button(action: onAdd) {
                    Label("Adicionar investimento", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)

                Button(action: onImport) {
                    Label("Importar da minha planilha", systemImage: "tablecells")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button(action: onSample) {
                    Text("Explorar com dados de exemplo")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderless)
            }
            .controlSize(.large)
            .padding(.top, 8)
        }
    }
}

// MARK: - Resumo

private struct SummaryCard: View {
    let analytics: PortfolioAnalytics
    let hidden: Bool

    var body: some View {
        let now = Date().endOfDay
        let total = analytics.totalValue(asOf: now)
        let invested = analytics.invested(asOf: now)
        let proventos = analytics.proventos(to: now)
        let totalGain = total - invested + proventos
        let month = analytics.performance(for: now, now: now)
        let yearStart = Calendar.app.date(from: Calendar.app.dateComponents([.year], from: now)) ?? now
        let ytd = analytics.performance(limit: nil, now: now).filter { $0.month >= yearStart }
        let ytdRate = ytd.compactMap(\.returnRate).reduce(1.0) { $0 * (1 + $1) } - 1

        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Patrimônio total")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(Fmt.currency(total, hidden: hidden))
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    ChangeLabel(value: month.gain, percent: month.returnRate, hidden: hidden)
                    Text("no mês").font(.subheadline).foregroundStyle(.secondary)
                }
            }

            Divider()

            HStack(alignment: .top) {
                metric("Investido", Fmt.currency(invested, hidden: hidden))
                Spacer()
                metric("Ganho total", Fmt.signedCurrency(totalGain, hidden: hidden), color: totalGain >= 0 ? .green : .red)
                Spacer()
                metric("No ano", Fmt.percent(ytdRate, signed: true), color: ytdRate >= 0 ? .green : .red)
            }
        }
        .card()
    }

    private func metric(_ title: String, _ value: String, color: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(color).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Meta

private struct GoalCard: View {
    let analytics: PortfolioAnalytics
    let goal: Double
    let hidden: Bool

    var body: some View {
        let total = analytics.totalValue()
        let progress = min(max(total / goal, 0), 1)
        let last12 = analytics.performance(limit: 12)
        let avgContribution = last12.isEmpty ? 0 : last12.reduce(0) { $0 + $1.netContribution } / Double(last12.count)
        let rates = last12.compactMap(\.returnRate)
        let avgRate = rates.isEmpty ? 0 : max(rates.reduce(0, +) / Double(rates.count), 0)
        let months = PortfolioAnalytics.monthsToReach(goal: goal, current: total, monthlyContribution: max(avgContribution, 0), monthlyRate: avgRate)

        VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: "Meta de patrimônio", subtitle: Fmt.currency(goal, hidden: hidden)) {
                Text(Fmt.percent(progress))
                    .font(.headline)
                    .foregroundStyle(.tint)
            }
            ProgressView(value: progress)
                .tint(progress >= 1 ? Color.green : Color.accentColor)
                .scaleEffect(x: 1, y: 2, anchor: .center)
            if progress >= 1 {
                Label("Meta atingida! 🎉", systemImage: "checkmark.seal.fill")
                    .font(.subheadline)
                    .foregroundStyle(.green)
            } else {
                HStack {
                    Text("Faltam \(Fmt.currency(goal - total, hidden: hidden))")
                    Spacer()
                    if let months {
                        Text("≈ \(Self.describe(months: months))")
                            .foregroundStyle(.secondary)
                    }
                }
                .font(.subheadline)
                Text("Estimativa com base na média de aportes e rentabilidade dos últimos 12 meses.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .card()
    }

    static func describe(months: Int) -> String {
        let years = months / 12
        let rest = months % 12
        switch (years, rest) {
        case (0, let m): return "\(m) \(m == 1 ? "mês" : "meses")"
        case (let y, 0): return "\(y) \(y == 1 ? "ano" : "anos")"
        default: return "\(years)a \(rest)m"
        }
    }
}

// MARK: - Evolução patrimonial

private struct EvolutionCard: View {
    let analytics: PortfolioAnalytics
    let hidden: Bool

    enum Mode: String, CaseIterable, Identifiable {
        case total = "Total"
        case byClass = "Por classe"
        var id: String { rawValue }
    }

    @State private var period: ChartPeriod = .oneYear
    @State private var mode: Mode = .total
    @State private var selectedDate: Date?

    private struct ClassPoint: Identifiable {
        var id: String { "\(cls.rawValue)-\(month.timeIntervalSince1970)" }
        let month: Date
        let cls: AssetClass
        let value: Double
    }

    var body: some View {
        let points = analytics.evolution(limit: period.months)
        let classes = AssetClass.allCases.filter { cls in points.contains { ($0.byClass[cls] ?? 0) > 0 } }
        let classPoints = points.flatMap { p in classes.map { ClassPoint(month: p.month, cls: $0, value: p.byClass[$0] ?? 0) } }
        let selected = selectedDate.flatMap { d in points.first { $0.month.isSameMonth(as: d) } }

        VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: "Evolução patrimonial", subtitle: subtitle(points))
            Picker("Visualização", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            if let selected {
                HStack {
                    Text(Fmt.monthYear.string(from: selected.month).capitalized)
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text(Fmt.currency(selected.total, hidden: hidden))
                        .font(.caption.weight(.semibold)).monospacedDigit()
                    Text("investido \(Fmt.currency(selected.invested, hidden: hidden))")
                        .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                }
            }

            Group {
                switch mode {
                case .total:
                    Chart {
                        ForEach(points) { p in
                            AreaMark(x: .value("Mês", p.month, unit: .month), y: .value("Patrimônio", p.total))
                                .interpolationMethod(.monotone)
                                .foregroundStyle(
                                    LinearGradient(colors: [Color.accentColor.opacity(0.35), Color.accentColor.opacity(0.02)], startPoint: .top, endPoint: .bottom)
                                )
                            LineMark(x: .value("Mês", p.month, unit: .month), y: .value("Patrimônio", p.total), series: .value("Série", "Patrimônio"))
                                .interpolationMethod(.monotone)
                                .lineStyle(StrokeStyle(lineWidth: 2.5))
                                .foregroundStyle(Color.accentColor)
                            LineMark(x: .value("Mês", p.month, unit: .month), y: .value("Investido", p.invested), series: .value("Série", "Investido"))
                                .interpolationMethod(.stepEnd)
                                .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                                .foregroundStyle(Color.secondary)
                        }
                        if let selected {
                            RuleMark(x: .value("Mês", selected.month, unit: .month))
                                .foregroundStyle(Color.secondary.opacity(0.4))
                        }
                    }
                case .byClass:
                    Chart(classPoints) { p in
                        AreaMark(x: .value("Mês", p.month, unit: .month), y: .value("Valor", p.value), stacking: .standard)
                            .interpolationMethod(.monotone)
                            .foregroundStyle(by: .value("Classe", p.cls.title))
                    }
                    .chartForegroundStyleScale(domain: classes.map(\.title), range: classes.map(\.color))
                    .chartLegend(position: .bottom, alignment: .leading, spacing: 8)
                }
            }
            .chartXSelection(value: $selectedDate)
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let v = value.as(Double.self) {
                            Text(hidden ? "" : Fmt.compactCurrency(v))
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                    AxisGridLine()
                    AxisValueLabel(format: .dateTime.month(.abbreviated).year(.twoDigits))
                }
            }
            .frame(height: mode == .total ? 220 : 260)

            if mode == .total {
                HStack(spacing: 16) {
                    LegendDot(color: .accentColor, label: "Patrimônio")
                    LegendDot(color: .secondary, label: "Valor investido", dashed: true)
                }
            }

            Picker("Período", selection: $period) {
                ForEach(ChartPeriod.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
        }
        .card()
    }

    private func subtitle(_ points: [EvolutionPoint]) -> String? {
        guard let first = points.first, let last = points.last, points.count > 1, !hidden else { return nil }
        let diff = last.total - first.total
        return "\(Fmt.signedCurrency(diff)) desde \(Fmt.shortMonthYear.string(from: first.month))"
    }
}

// MARK: - Alocação

private struct AllocationCard: View {
    let analytics: PortfolioAnalytics
    let hidden: Bool

    enum Mode: String, CaseIterable, Identifiable {
        case byClass = "Classe"
        case byInstitution = "Instituição"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .byClass

    var body: some View {
        let slices = mode == .byClass ? analytics.allocationByClass() : analytics.allocationByInstitution()
        let total = slices.reduce(0) { $0 + $1.value }

        VStack(alignment: .leading, spacing: 14) {
            CardHeader(title: "Distribuição da carteira")
            Picker("Agrupar por", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            Chart(slices) { s in
                SectorMark(angle: .value("Valor", s.value), innerRadius: .ratio(0.62), angularInset: 1.5)
                    .cornerRadius(4)
                    .foregroundStyle(Color(hex: s.colorHex))
            }
            .frame(height: 210)
            .chartBackground { proxy in
                GeometryReader { geo in
                    if let plotFrame = proxy.plotFrame {
                        let frame = geo[plotFrame]
                        VStack(spacing: 2) {
                            Text("\(slices.count) \(mode == .byClass ? "classes" : "instituições")")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(hidden ? "•••" : Fmt.compactCurrency(total))
                                .font(.headline).monospacedDigit()
                        }
                        .position(x: frame.midX, y: frame.midY)
                    }
                }
            }

            VStack(spacing: 10) {
                ForEach(slices) { s in
                    HStack(spacing: 10) {
                        Circle().fill(Color(hex: s.colorHex)).frame(width: 10, height: 10)
                        Text(s.label).font(.subheadline).lineLimit(1)
                        Spacer()
                        Text(Fmt.currency(s.value, hidden: hidden))
                            .font(.subheadline).foregroundStyle(.secondary).monospacedDigit()
                        Text(Fmt.percent(s.share))
                            .font(.subheadline.weight(.semibold)).monospacedDigit()
                            .frame(width: 64, alignment: .trailing)
                    }
                }
            }
        }
        .card()
    }
}

// MARK: - Rentabilidade

private struct PerformanceCard: View {
    let analytics: PortfolioAnalytics
    @ObservedObject var benchmarks: BenchmarkStore
    let hidden: Bool

    @State private var period: ChartPeriod = .oneYear

    var body: some View {
        let perf = analytics.performance(limit: period.months)
        let portfolio = PortfolioAnalytics.cumulative(perf.map { ($0.month, $0.returnRate) }, series: "Carteira")
        let cdi = PortfolioAnalytics.cumulative(benchmarkRates(perf, benchmarks.cdi), series: "CDI")
        let ipca = PortfolioAnalytics.cumulative(benchmarkRates(perf, benchmarks.ipca), series: "IPCA")
        let cumulative = portfolio + cdi + ipca
        let accPortfolio = portfolio.last?.value ?? 0
        let accCDI = cdi.last?.value

        VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: "Rentabilidade", subtitle: "Mensal e acumulada no período") {
                if benchmarks.isLoading { ProgressView().controlSize(.small) }
            }

            HStack(spacing: 20) {
                stat("Carteira", Fmt.percent(accPortfolio, signed: true), color: accPortfolio >= 0 ? .green : .red)
                if let accCDI {
                    stat("CDI", Fmt.percent(accCDI, signed: true), color: .orange)
                    if accCDI > 0.0001 {
                        stat("% do CDI", Fmt.percent(accPortfolio / accCDI), color: .primary)
                    }
                }
            }

            Chart(perf) { p in
                BarMark(x: .value("Mês", p.month, unit: .month), y: .value("Rentabilidade", (p.returnRate ?? 0) * 100))
                    .foregroundStyle((p.returnRate ?? 0) >= 0 ? Color.green.gradient : Color.red.gradient)
                    .cornerRadius(3)
            }
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let v = value.as(Double.self) { Text(String(format: "%.1f%%", v)) }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                    AxisValueLabel(format: .dateTime.month(.narrow))
                }
            }
            .frame(height: 140)

            if !cumulative.isEmpty {
                Text("Acumulado").font(.subheadline.weight(.semibold)).padding(.top, 4)
                Chart(cumulative) { p in
                    LineMark(x: .value("Mês", p.month, unit: .month), y: .value("Acumulado", p.value * 100))
                        .foregroundStyle(by: .value("Série", p.series))
                        .interpolationMethod(.monotone)
                        .lineStyle(StrokeStyle(lineWidth: p.series == "Carteira" ? 2.5 : 1.5))
                }
                .chartForegroundStyleScale(["Carteira": Color.accentColor, "CDI": Color.orange, "IPCA": Color.gray])
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisGridLine()
                        AxisValueLabel {
                            if let v = value.as(Double.self) { Text(String(format: "%.0f%%", v)) }
                        }
                    }
                }
                .chartLegend(position: .bottom, alignment: .leading)
                .frame(height: 180)
            }

            Picker("Período", selection: $period) {
                ForEach(ChartPeriod.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            if let error = benchmarks.lastError, benchmarks.cdi.isEmpty {
                Text(error).font(.caption2).foregroundStyle(.secondary)
            }
        }
        .card()
    }

    private func benchmarkRates(_ perf: [MonthPerformance], _ series: [String: Double]) -> [(Date, Double?)] {
        // Começa a comparar a partir do primeiro mês com rentabilidade calculada.
        guard let firstValid = perf.firstIndex(where: { $0.returnRate != nil }) else { return [] }
        return perf[firstValid...].map { ($0.month, series[$0.month.monthKey]) }
    }

    private func stat(_ title: String, _ value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.weight(.semibold)).foregroundStyle(color).monospacedDigit()
        }
    }
}

// MARK: - Aportes

private struct ContributionsCard: View {
    let analytics: PortfolioAnalytics
    let hidden: Bool

    private struct Bar: Identifiable {
        var id: String { "\(kind)-\(month.timeIntervalSince1970)" }
        let month: Date
        let kind: String
        let value: Double
    }

    var body: some View {
        let perf = analytics.performance(limit: 12)
        let bars = perf.flatMap { p in
            [
                Bar(month: p.month, kind: "Aportes", value: p.aportes),
                Bar(month: p.month, kind: "Resgates", value: -p.resgates),
                Bar(month: p.month, kind: "Proventos", value: p.proventos),
            ]
        }
        let totalAportes = perf.reduce(0) { $0 + $1.aportes }
        let totalResgates = perf.reduce(0) { $0 + $1.resgates }
        let totalProventos = perf.reduce(0) { $0 + $1.proventos }
        let avg = perf.isEmpty ? 0 : (totalAportes - totalResgates) / Double(perf.count)

        VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: "Aportes e proventos", subtitle: "Últimos 12 meses")

            HStack(alignment: .top) {
                metric("Aportado", Fmt.currency(totalAportes, hidden: hidden), .green)
                Spacer()
                metric("Resgatado", Fmt.currency(totalResgates, hidden: hidden), .red)
                Spacer()
                metric("Proventos", Fmt.currency(totalProventos, hidden: hidden), .orange)
            }

            Chart(bars) { b in
                BarMark(x: .value("Mês", b.month, unit: .month), y: .value("Valor", b.value))
                    .foregroundStyle(by: .value("Tipo", b.kind))
                    .position(by: .value("Tipo", b.kind == "Resgates" ? "Aportes" : b.kind))
                    .cornerRadius(2)
            }
            .chartForegroundStyleScale(["Aportes": Color.green, "Resgates": Color.red, "Proventos": Color.orange])
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let v = value.as(Double.self) { Text(hidden ? "" : Fmt.compactCurrency(v)) }
                    }
                }
            }
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 6)) { _ in
                    AxisValueLabel(format: .dateTime.month(.narrow))
                }
            }
            .chartLegend(position: .bottom, alignment: .leading)
            .frame(height: 180)

            Text("Média líquida: \(Fmt.currency(avg, hidden: hidden))/mês")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .card()
    }

    private func metric(_ title: String, _ value: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(color).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

// MARK: - Instituições

private struct InstitutionsCard: View {
    let analytics: PortfolioAnalytics
    let hidden: Bool

    var body: some View {
        let slices = analytics.allocationByInstitution()
        let now = Date()
        let lastMonthEnd = now.startOfMonth.addingTimeInterval(-1)

        VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: "Por instituição", subtitle: "Variação em relação ao fim do mês passado")
            ForEach(slices) { s in
                let previous = analytics.assets
                    .filter { $0.institutionName == s.label }
                    .reduce(0) { $0 + analytics.value(of: $1, asOf: lastMonthEnd) }
                let diff = s.value - previous
                HStack(spacing: 12) {
                    InstitutionBadge(name: s.label, colorHex: s.colorHex)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.label).font(.subheadline.weight(.medium))
                        Text(Fmt.percent(s.share) + " da carteira").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(Fmt.currency(s.value, hidden: hidden)).font(.subheadline.weight(.semibold)).monospacedDigit()
                        if previous > 0 {
                            Text(Fmt.signedCurrency(diff, hidden: hidden))
                                .font(.caption).monospacedDigit()
                                .foregroundStyle(diff >= 0 ? Color.green : Color.red)
                        }
                    }
                }
            }
        }
        .card()
    }
}
