import SwiftUI
import SwiftData

/// Tela principal do "fechamento do mês": substitui a atualização da planilha.
/// Lista todos os investimentos ativos agrupados por instituição para digitar os saldos de uma vez.
struct UpdateBalancesView: View {
    @Environment(\.modelContext) private var context
    @Query(filter: #Predicate<Asset> { $0.isArchived == false }, sort: \Asset.name)
    private var assets: [Asset]
    @AppStorage("hideValues") private var hideValues = false

    @State private var date = Date()
    @State private var entries: [UUID: Entry] = [:]
    @State private var savedMessage: String?
    @State private var showNewAsset = false

    struct Entry: Equatable {
        var balance = ""
        var flow = ""
        var flowKind: MovementKind = .aporte
        var showFlow = false

        var parsedBalance: Double? { Fmt.parseNumber(balance) }
        var parsedFlow: Double? { Fmt.parseNumber(flow).flatMap { $0 > 0 ? $0 : nil } }
        var hasChanges: Bool { parsedBalance != nil || parsedFlow != nil }
    }

    private struct InstitutionGroup: Identifiable {
        var id: String { name }
        let name: String
        let colorHex: String
        let assets: [Asset]
    }

    private var grouped: [InstitutionGroup] {
        Dictionary(grouping: assets) { $0.institutionName }
            .map { InstitutionGroup(name: $0.key, colorHex: $0.value.first?.institution?.colorHex ?? "#8E8E93", assets: $0.value) }
            .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    private var pendingCount: Int { entries.values.filter(\.hasChanges).count }

    private var outdatedCount: Int {
        assets.filter { a in
            guard let last = a.lastUpdate else { return true }
            return !last.isSameMonth(as: date)
        }.count
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    DatePicker("Data dos saldos", selection: $date, displayedComponents: .date)
                    if !assets.isEmpty {
                        HStack {
                            Image(systemName: outdatedCount == 0 ? "checkmark.circle.fill" : "clock.badge.exclamationmark")
                                .foregroundStyle(outdatedCount == 0 ? Color.green : Color.orange)
                            Text(outdatedCount == 0
                                 ? "Todos os investimentos já foram atualizados neste mês."
                                 : "\(outdatedCount) de \(assets.count) investimento(s) sem saldo em \(Fmt.monthYear.string(from: date)).")
                                .font(.footnote)
                        }
                    }
                } footer: {
                    Text("Abra o app de cada banco e digite o saldo atual. Campos vazios mantêm o último saldo. Use “+ movimentação” para registrar aportes e resgates, assim a rentabilidade fica correta.")
                }

                ForEach(grouped) { group in
                    Section {
                        ForEach(group.assets) { asset in
                            UpdateRow(asset: asset, entry: binding(for: asset), hidden: hideValues, referenceDate: date)
                        }
                    } header: {
                        HStack(spacing: 8) {
                            Circle().fill(Color(hex: group.colorHex)).frame(width: 10, height: 10)
                            Text(group.name)
                        }
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Atualizar saldos")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showNewAsset = true } label: { Image(systemName: "plus") }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("OK") { hideKeyboard() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if pendingCount > 0 {
                    Button(action: save) {
                        Text("Salvar \(pendingCount) atualização(ões)")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding()
                    .background(.bar)
                }
            }
            .overlay {
                if assets.isEmpty {
                    ContentUnavailableView {
                        Label("Nada para atualizar", systemImage: "arrow.triangle.2.circlepath")
                    } description: {
                        Text("Cadastre seus investimentos na aba Carteira ou importe sua planilha em Ajustes.")
                    } actions: {
                        Button("Adicionar investimento") { showNewAsset = true }
                            .buttonStyle(.borderedProminent)
                    }
                }
            }
            .alert("Saldos atualizados", isPresented: Binding(get: { savedMessage != nil }, set: { if !$0 { savedMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(savedMessage ?? "")
            }
            .sheet(isPresented: $showNewAsset) { AssetFormView(asset: nil) }
        }
    }

    private func binding(for asset: Asset) -> Binding<Entry> {
        Binding(
            get: { entries[asset.uid] ?? Entry() },
            set: { entries[asset.uid] = $0 }
        )
    }

    private func save() {
        hideKeyboard()
        var balances = 0
        var flows = 0
        let before = assets.reduce(0) { $0 + $1.currentValue }
        for asset in assets {
            guard let entry = entries[asset.uid] else { continue }
            if let v = entry.parsedBalance {
                PortfolioStore.recordBalance(v, on: date, for: asset, in: context)
                balances += 1
            }
            if let f = entry.parsedFlow {
                PortfolioStore.recordMovement(entry.flowKind, amount: f, on: date, for: asset, in: context)
                flows += 1
            }
        }
        try? context.save()
        entries = [:]
        let after = assets.reduce(0) { $0 + $1.currentValue }
        var message = "\(balances) saldo(s) e \(flows) movimentação(ões) registrados."
        if !hideValues {
            message += "\nPatrimônio: \(Fmt.currency(after)) (\(Fmt.signedCurrency(after - before)))."
        }
        savedMessage = message
    }
}

private struct UpdateRow: View {
    let asset: Asset
    @Binding var entry: UpdateBalancesView.Entry
    let hidden: Bool
    let referenceDate: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                IconBadge(systemName: asset.assetClass.icon, color: asset.assetClass.color, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(asset.name).font(.subheadline.weight(.medium)).lineLimit(1)
                    HStack(spacing: 4) {
                        if let last = asset.lastUpdate, last.isSameMonth(as: referenceDate) {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        }
                        Text(lastInfo)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                Spacer(minLength: 4)
                CurrencyField(hidden ? "novo saldo" : Fmt.editable(asset.currentValue), text: $entry.balance)
                    .frame(maxWidth: 150)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
            }

            if entry.showFlow {
                HStack(spacing: 8) {
                    Picker("Tipo", selection: $entry.flowKind) {
                        ForEach(MovementKind.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    CurrencyField("valor", text: $entry.flow)
                        .frame(maxWidth: 120)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
                }
            }

            HStack {
                Button {
                    withAnimation { entry.showFlow.toggle() }
                } label: {
                    Label(entry.showFlow ? "Sem movimentação" : "+ movimentação", systemImage: entry.showFlow ? "minus.circle" : "arrow.left.arrow.right")
                        .font(.caption)
                }
                .buttonStyle(.borderless)

                Spacer()

                if let v = entry.parsedBalance, !hidden {
                    let diff = v - asset.currentValue
                    Text(Fmt.signedCurrency(diff))
                        .font(.caption.weight(.medium))
                        .monospacedDigit()
                        .foregroundStyle(diff >= 0 ? Color.green : Color.red)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var lastInfo: String {
        guard let last = asset.lastUpdate else { return "Sem saldo informado" }
        return "\(Fmt.currency(asset.currentValue, hidden: hidden)) em \(Fmt.shortDay.string(from: last))"
    }
}
