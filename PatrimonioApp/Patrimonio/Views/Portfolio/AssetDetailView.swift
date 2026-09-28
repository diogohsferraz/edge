import SwiftUI
import SwiftData
import Charts

struct AssetDetailView: View {
    @Bindable var asset: Asset

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @AppStorage("hideValues") private var hideValues = false
    @State private var showEdit = false
    @State private var showUpdate = false
    @State private var confirmDelete = false
    @State private var isDeleting = false

    private enum HistoryItem: Identifiable {
        case balance(BalanceSnapshot)
        case movement(Movement)

        var id: PersistentIdentifier {
            switch self {
            case .balance(let s): return s.persistentModelID
            case .movement(let m): return m.persistentModelID
            }
        }

        var date: Date {
            switch self {
            case .balance(let s): return s.date
            case .movement(let m): return m.date
            }
        }
    }

    private var history: [HistoryItem] {
        (asset.snapshots.map(HistoryItem.balance) + asset.movements.map(HistoryItem.movement))
            .sorted { $0.date > $1.date }
    }

    var body: some View {
        if isDeleting {
            Color.clear
        } else {
            content
        }
    }

    private var content: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        IconBadge(systemName: asset.assetClass.icon, color: asset.assetClass.color, size: 40)
                        VStack(alignment: .leading) {
                            Text(asset.assetClass.title).font(.caption).foregroundStyle(.secondary)
                            Text(asset.institutionName).font(.subheadline.weight(.medium))
                        }
                    }
                    Text(Fmt.currency(asset.currentValue, hidden: hideValues))
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .monospacedDigit()
                    ChangeLabel(value: asset.totalGain, percent: asset.gainPercent, hidden: hideValues)
                    if let last = asset.lastUpdate {
                        Text("Atualizado em \(Fmt.day.string(from: last))")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)

                Button {
                    showUpdate = true
                } label: {
                    Label("Atualizar saldo / movimentar", systemImage: "arrow.triangle.2.circlepath")
                }
            }

            if asset.snapshots.count >= 2 {
                Section("Evolução") {
                    Chart(asset.sortedSnapshots) { s in
                        AreaMark(x: .value("Data", s.date), y: .value("Saldo", s.value))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(asset.assetClass.color.opacity(0.2).gradient)
                        LineMark(x: .value("Data", s.date), y: .value("Saldo", s.value))
                            .interpolationMethod(.monotone)
                            .foregroundStyle(asset.assetClass.color)
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading) { value in
                            AxisGridLine()
                            AxisValueLabel {
                                if let v = value.as(Double.self) { Text(hideValues ? "" : Fmt.compactCurrency(v)) }
                            }
                        }
                    }
                    .chartYScale(domain: .automatic(includesZero: false))
                    .frame(height: 180)
                    .padding(.vertical, 8)
                }
            }

            Section("Resumo") {
                LabeledContent("Valor investido", value: Fmt.currency(asset.investedAmount, hidden: hideValues))
                LabeledContent("Proventos recebidos", value: Fmt.currency(asset.totalProventos, hidden: hideValues))
                LabeledContent("Resultado") {
                    Text(Fmt.signedCurrency(asset.totalGain, hidden: hideValues))
                        .foregroundStyle(asset.totalGain >= 0 ? Color.green : Color.red)
                }
            }

            Section("Informações") {
                if !asset.ticker.isEmpty { LabeledContent("Código / ticker", value: asset.ticker) }
                if !asset.indexer.isEmpty { LabeledContent("Indexador", value: asset.indexer) }
                if let maturity = asset.maturityDate {
                    LabeledContent("Vencimento", value: Fmt.day.string(from: maturity))
                    let days = Calendar.app.dateComponents([.day], from: Date(), to: maturity).day ?? 0
                    if days >= 0 {
                        LabeledContent("Faltam", value: "\(days) dias")
                    }
                }
                if !asset.notes.isEmpty {
                    Text(asset.notes).font(.callout).foregroundStyle(.secondary)
                }
                LabeledContent("Cadastrado em", value: Fmt.day.string(from: asset.createdAt))
            }

            Section {
                if history.isEmpty {
                    Text("Nenhum registro ainda.").foregroundStyle(.secondary)
                }
                ForEach(history) { item in
                    HistoryRow(item: item, hidden: hideValues)
                }
                .onDelete { offsets in
                    let items = history
                    for i in offsets {
                        switch items[i] {
                        case .balance(let s): context.delete(s)
                        case .movement(let m): context.delete(m)
                        }
                    }
                }
            } header: {
                Text("Histórico")
            } footer: {
                Text("Deslize para a esquerda para apagar um registro.")
            }

            Section {
                Button {
                    asset.isArchived.toggle()
                } label: {
                    Label(asset.isArchived ? "Reativar investimento" : "Arquivar (resgatado/encerrado)", systemImage: "archivebox")
                }
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Excluir investimento", systemImage: "trash")
                }
            }
        }
        .navigationTitle(asset.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button("Editar") { showEdit = true }
        }
        .sheet(isPresented: $showEdit) { AssetFormView(asset: asset) }
        .sheet(isPresented: $showUpdate) { QuickUpdateView(asset: asset) }
        .confirmationDialog("Excluir \(asset.name)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Excluir investimento e histórico", role: .destructive) {
                // Sai da tela antes de apagar para não renderizar um objeto excluído.
                isDeleting = true
                let target = asset
                dismiss()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    context.delete(target)
                }
            }
        }
    }

    private struct HistoryRow: View {
        let item: HistoryItem
        let hidden: Bool

        var body: some View {
            switch item {
            case .balance(let s):
                HStack {
                    Image(systemName: "equal.circle.fill").foregroundStyle(.blue)
                    VStack(alignment: .leading) {
                        Text("Saldo informado")
                        Text(Fmt.day.string(from: s.date)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(Fmt.currency(s.value, hidden: hidden)).monospacedDigit()
                }
            case .movement(let m):
                HStack {
                    Image(systemName: m.kind.icon).foregroundStyle(m.kind.color)
                    VStack(alignment: .leading) {
                        Text(m.note.isEmpty ? m.kind.title : "\(m.kind.title) · \(m.note)").lineLimit(1)
                        Text(Fmt.day.string(from: m.date)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(Fmt.currency(m.amount, hidden: hidden))
                        .monospacedDigit()
                        .foregroundStyle(m.kind.color)
                }
            }
        }
    }
}

/// Atualização rápida de um único ativo: novo saldo e/ou movimentação.
struct QuickUpdateView: View {
    let asset: Asset

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var balance = ""
    @State private var kind: MovementKind = .aporte
    @State private var amount = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Data", selection: $date, in: ...Date().addingTimeInterval(86_400 * 365), displayedComponents: .date)
                }
                Section {
                    CurrencyField("Saldo atual", text: $balance)
                } header: {
                    Text("Novo saldo")
                } footer: {
                    Text("Último saldo: \(Fmt.currency(asset.currentValue)). Informe o valor que aparece hoje no app do banco.")
                }
                Section("Movimentação (opcional)") {
                    Picker("Tipo", selection: $kind) {
                        ForEach(MovementKind.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    CurrencyField("Valor", text: $amount)
                    TextField("Observação", text: $note)
                }
                if kind == .aporte, let a = Fmt.parseNumber(amount), a > 0, Fmt.parseNumber(balance) == nil {
                    Section {
                        Button("Somar aporte ao saldo atual (\(Fmt.currency(asset.currentValue + a)))") {
                            balance = Fmt.editable(asset.currentValue + a)
                        }
                    }
                }
            }
            .navigationTitle(asset.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") { save() }
                        .disabled(Fmt.parseNumber(balance) == nil && (Fmt.parseNumber(amount) ?? 0) <= 0)
                }
            }
        }
    }

    private func save() {
        if let v = Fmt.parseNumber(balance) {
            PortfolioStore.recordBalance(v, on: date, for: asset, in: context)
        }
        if let a = Fmt.parseNumber(amount), a > 0 {
            PortfolioStore.recordMovement(kind, amount: a, on: date, for: asset, note: note, in: context)
        }
        try? context.save()
        dismiss()
    }
}
