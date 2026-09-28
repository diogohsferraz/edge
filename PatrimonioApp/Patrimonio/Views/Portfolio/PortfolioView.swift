import SwiftUI
import SwiftData

struct PortfolioView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Asset.name) private var assets: [Asset]
    @AppStorage("hideValues") private var hideValues = false
    @AppStorage("portfolioGrouping") private var grouping: Grouping = .institution
    @State private var showArchived = false
    @State private var search = ""
    @State private var showNewAsset = false
    @State private var assetToDelete: Asset?
    @State private var showInstitutions = false

    enum Grouping: String, CaseIterable, Identifiable {
        case institution = "Instituição"
        case assetClass = "Classe"
        var id: String { rawValue }
    }

    private struct AssetGroup: Identifiable {
        let id: String
        let title: String
        let colorHex: String
        let icon: String?
        let assets: [Asset]
        var total: Double { assets.reduce(0) { $0 + $1.currentValue } }
    }

    private var visibleAssets: [Asset] {
        assets.filter { asset in
            (showArchived || !asset.isArchived) &&
            (search.isEmpty || asset.name.normalizedKey.contains(search.normalizedKey) || asset.institutionName.normalizedKey.contains(search.normalizedKey) || asset.ticker.normalizedKey.contains(search.normalizedKey))
        }
    }

    private var groups: [AssetGroup] {
        let list = visibleAssets
        switch grouping {
        case .institution:
            let dict = Dictionary(grouping: list) { $0.institutionName }
            return dict.map { name, items in
                AssetGroup(id: name, title: name, colorHex: items.first?.institution?.colorHex ?? "#8E8E93", icon: nil, assets: items.sorted { $0.currentValue > $1.currentValue })
            }
            .sorted { $0.total > $1.total }
        case .assetClass:
            let dict = Dictionary(grouping: list) { $0.assetClass }
            return dict.map { cls, items in
                AssetGroup(id: cls.rawValue, title: cls.title, colorHex: cls.colorHex, icon: cls.icon, assets: items.sorted { $0.currentValue > $1.currentValue })
            }
            .sorted { $0.total > $1.total }
        }
    }

    var body: some View {
        NavigationStack {
            let total = visibleAssets.reduce(0) { $0 + $1.currentValue }
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Total na carteira").font(.subheadline).foregroundStyle(.secondary)
                        Text(Fmt.currency(total, hidden: hideValues))
                            .font(.title.bold()).monospacedDigit()
                        Text("\(visibleAssets.count) investimento(s) em \(Set(visibleAssets.map(\.institutionName)).count) instituição(ões)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    Picker("Agrupar por", selection: $grouping) {
                        ForEach(Grouping.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                ForEach(groups) { group in
                    Section {
                        ForEach(group.assets) { asset in
                            NavigationLink(value: asset) {
                                AssetRow(asset: asset, portfolioTotal: total, hidden: hideValues, showInstitution: grouping == .assetClass)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    assetToDelete = asset
                                } label: {
                                    Label("Excluir", systemImage: "trash")
                                }
                                Button {
                                    asset.isArchived.toggle()
                                } label: {
                                    Label(asset.isArchived ? "Reativar" : "Arquivar", systemImage: "archivebox")
                                }
                                .tint(.gray)
                            }
                        }
                    } header: {
                        HStack(spacing: 8) {
                            if let icon = group.icon {
                                Image(systemName: icon).foregroundStyle(Color(hex: group.colorHex))
                            } else {
                                Circle().fill(Color(hex: group.colorHex)).frame(width: 10, height: 10)
                            }
                            Text(group.title)
                            Spacer()
                            Text(Fmt.currency(group.total, hidden: hideValues)).monospacedDigit()
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Carteira")
            .navigationDestination(for: Asset.self) { AssetDetailView(asset: $0) }
            .navigationDestination(isPresented: $showInstitutions) { InstitutionsListView() }
            .searchable(text: $search, prompt: "Buscar investimento")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showNewAsset = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Novo investimento")
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Toggle("Mostrar arquivados", isOn: $showArchived)
                        Button {
                            showInstitutions = true
                        } label: {
                            Label("Gerenciar instituições", systemImage: "building.columns")
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .overlay {
                if assets.isEmpty {
                    ContentUnavailableView {
                        Label("Nenhum investimento", systemImage: "briefcase")
                    } description: {
                        Text("Adicione seus investimentos de cada banco ou corretora.")
                    } actions: {
                        Button("Adicionar investimento") { showNewAsset = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else if groups.isEmpty && !search.isEmpty {
                    ContentUnavailableView.search(text: search)
                }
            }
            .sheet(isPresented: $showNewAsset) {
                AssetFormView(asset: nil)
            }
            .confirmationDialog(
                "Excluir \(assetToDelete?.name ?? "")?",
                isPresented: Binding(get: { assetToDelete != nil }, set: { if !$0 { assetToDelete = nil } }),
                titleVisibility: .visible
            ) {
                Button("Excluir investimento e histórico", role: .destructive) {
                    if let assetToDelete { context.delete(assetToDelete) }
                    assetToDelete = nil
                }
            } message: {
                Text("Todo o histórico de saldos e movimentações será apagado. Se você resgatou o investimento, prefira arquivá-lo para manter o histórico nos gráficos.")
            }
        }
    }
}

struct AssetRow: View {
    let asset: Asset
    let portfolioTotal: Double
    let hidden: Bool
    var showInstitution = false

    var body: some View {
        HStack(spacing: 12) {
            IconBadge(systemName: asset.assetClass.icon, color: asset.assetClass.color)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(asset.name).font(.body.weight(.medium)).lineLimit(1)
                    if asset.isArchived {
                        Text("arquivado").font(.caption2).padding(.horizontal, 5).padding(.vertical, 1)
                            .background(Color.secondary.opacity(0.15), in: Capsule())
                    }
                }
                Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text(Fmt.currency(asset.currentValue, hidden: hidden))
                    .font(.subheadline.weight(.semibold)).monospacedDigit()
                if let pct = asset.gainPercent {
                    Text(Fmt.percent(pct, signed: true))
                        .font(.caption).monospacedDigit()
                        .foregroundStyle(pct >= 0 ? Color.green : Color.red)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        var parts: [String] = []
        parts.append(showInstitution ? asset.institutionName : asset.assetClass.title)
        if !asset.indexer.isEmpty { parts.append(asset.indexer) }
        if portfolioTotal > 0 { parts.append(Fmt.percent(asset.currentValue / portfolioTotal)) }
        return parts.joined(separator: " · ")
    }
}
