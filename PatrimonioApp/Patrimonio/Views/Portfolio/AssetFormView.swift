import SwiftUI
import SwiftData

/// Cadastro / edição de investimento.
struct AssetFormView: View {
    let asset: Asset?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Institution.name) private var institutions: [Institution]

    @State private var name = ""
    @State private var assetClass: AssetClass = .rendaFixa
    @State private var institution: Institution?
    @State private var ticker = ""
    @State private var indexer = ""
    @State private var hasMaturity = false
    @State private var maturity = Date().addingMonths(24)
    @State private var notes = ""
    @State private var initialValue = ""
    @State private var initialDate = Date()
    @State private var showNewInstitution = false
    @State private var loaded = false

    private var isNew: Bool { asset == nil }

    var body: some View {
        NavigationStack {
            Form {
                Section("Investimento") {
                    TextField("Nome (ex.: CDB Banco X 2027)", text: $name)
                    Picker("Classe", selection: $assetClass) {
                        ForEach(AssetClass.allCases) { cls in
                            Label(cls.title, systemImage: cls.icon).tag(cls)
                        }
                    }
                    Text(assetClass.examples).font(.caption).foregroundStyle(.secondary)
                }

                Section {
                    Picker("Instituição", selection: $institution) {
                        Text("Selecione").tag(Institution?.none)
                        ForEach(institutions) { inst in
                            Text(inst.name).tag(Optional(inst))
                        }
                    }
                    Button {
                        showNewInstitution = true
                    } label: {
                        Label("Nova instituição", systemImage: "plus.circle")
                    }
                } header: {
                    Text("Onde está")
                }

                if isNew {
                    Section {
                        CurrencyField("Saldo atual", text: $initialValue)
                        DatePicker("Data do saldo", selection: $initialDate, displayedComponents: .date)
                    } header: {
                        Text("Posição inicial")
                    } footer: {
                        Text("O saldo inicial é registrado como aporte, para que a rentabilidade seja calculada a partir daqui.")
                    }
                }

                Section("Detalhes (opcional)") {
                    TextField("Indexador (ex.: 110% CDI, IPCA + 6%)", text: $indexer)
                    TextField("Código / ticker (ex.: PETR4)", text: $ticker)
                        .textInputAutocapitalization(.characters)
                    Toggle("Tem vencimento", isOn: $hasMaturity.animation())
                    if hasMaturity {
                        DatePicker("Vencimento", selection: $maturity, displayedComponents: .date)
                    }
                    TextField("Observações", text: $notes, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(isNew ? "Novo investimento" : "Editar investimento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .sheet(isPresented: $showNewInstitution) {
                InstitutionFormView(institution: nil) { created in
                    institution = created
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        if let asset {
            name = asset.name
            assetClass = asset.assetClass
            institution = asset.institution
            ticker = asset.ticker
            indexer = asset.indexer
            hasMaturity = asset.maturityDate != nil
            maturity = asset.maturityDate ?? maturity
            notes = asset.notes
        } else if institutions.count == 1 {
            institution = institutions.first
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let asset {
            asset.name = trimmed
            asset.assetClass = assetClass
            asset.institution = institution
            asset.ticker = ticker
            asset.indexer = indexer
            asset.maturityDate = hasMaturity ? maturity : nil
            asset.notes = notes
        } else {
            PortfolioStore.createAsset(
                name: trimmed,
                assetClass: assetClass,
                institution: institution,
                ticker: ticker,
                indexer: indexer,
                maturityDate: hasMaturity ? maturity : nil,
                notes: notes,
                initialValue: Fmt.parseNumber(initialValue),
                initialDate: initialDate,
                in: context
            )
        }
        try? context.save()
        dismiss()
    }
}

// MARK: - Instituições

struct InstitutionsListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Institution.name) private var institutions: [Institution]
    @AppStorage("hideValues") private var hideValues = false
    @State private var editing: Institution?
    @State private var showNew = false
    @State private var toDelete: Institution?

    var body: some View {
        List {
            ForEach(institutions) { inst in
                Button {
                    editing = inst
                } label: {
                    HStack(spacing: 12) {
                        InstitutionBadge(name: inst.name, colorHex: inst.colorHex)
                        VStack(alignment: .leading) {
                            Text(inst.name).foregroundStyle(.primary)
                            Text("\(inst.activeAssets.count) investimento(s) ativo(s)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(Fmt.currency(inst.totalValue, hidden: hideValues))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { toDelete = inst } label: { Label("Excluir", systemImage: "trash") }
                }
            }
        }
        .overlay {
            if institutions.isEmpty {
                ContentUnavailableView("Nenhuma instituição", systemImage: "building.columns", description: Text("Cadastre os bancos e corretoras onde você investe."))
            }
        }
        .navigationTitle("Instituições")
        .toolbar {
            Button { showNew = true } label: { Image(systemName: "plus") }
        }
        .sheet(isPresented: $showNew) { InstitutionFormView(institution: nil) }
        .sheet(item: $editing) { InstitutionFormView(institution: $0) }
        .confirmationDialog(
            "Excluir \(toDelete?.name ?? "")?",
            isPresented: Binding(get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button("Excluir instituição e seus investimentos", role: .destructive) {
                if let toDelete { context.delete(toDelete) }
                toDelete = nil
            }
        } message: {
            Text("Todos os investimentos desta instituição e seus históricos serão apagados.")
        }
    }
}

struct InstitutionFormView: View {
    let institution: Institution?
    var onCreate: ((Institution) -> Void)?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var existing: [Institution]
    @State private var name = ""
    @State private var color = Color(hex: "#5E5CE6")
    @State private var loaded = false

    init(institution: Institution?, onCreate: ((Institution) -> Void)? = nil) {
        self.institution = institution
        self.onCreate = onCreate
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        InstitutionBadge(name: name.isEmpty ? "?" : name, colorHex: color.hexString, size: 44)
                        TextField("Nome do banco ou corretora", text: $name)
                            .font(.title3)
                    }
                    ColorPicker("Cor", selection: $color, supportsOpacity: false)
                }

                if institution == nil {
                    Section("Sugestões") {
                        let used = Set(existing.map { $0.name.normalizedKey })
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                            ForEach(InstitutionPreset.all.filter { !used.contains($0.name.normalizedKey) }) { preset in
                                Button {
                                    name = preset.name
                                    color = Color(hex: preset.colorHex)
                                } label: {
                                    HStack(spacing: 6) {
                                        Circle().fill(Color(hex: preset.colorHex)).frame(width: 10, height: 10)
                                        Text(preset.name).font(.caption).lineLimit(1)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 8)
                                    .frame(maxWidth: .infinity)
                                    .background(Color(.tertiarySystemFill), in: Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle(institution == nil ? "Nova instituição" : "Editar instituição")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                if let institution {
                    name = institution.name
                    color = Color(hex: institution.colorHex)
                } else {
                    color = Color(hex: Palette.color(for: existing.count))
                }
            }
        }
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if let institution {
            institution.name = trimmed
            institution.colorHex = color.hexString
        } else {
            let inst = Institution(name: trimmed, colorHex: color.hexString)
            context.insert(inst)
            onCreate?(inst)
        }
        try? context.save()
        dismiss()
    }
}
