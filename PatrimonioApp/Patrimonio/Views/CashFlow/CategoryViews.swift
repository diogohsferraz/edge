import SwiftUI
import SwiftData

/// Seletor de categoria com subcategorias recuadas e a opção de criar uma nova.
struct CategoryPicker: View {
    let isIncome: Bool
    @Binding var selection: String
    var allowNew = true

    @Query(sort: \CustomCategory.createdAt) private var customCategories: [CustomCategory]
    @State private var showNew = false

    var body: some View {
        let catalog = CategoryCatalog(customCategories)
        Picker("Categoria", selection: $selection) {
            ForEach(catalog.flat(isIncome: isIncome), id: \.info.key) { item in
                Label(item.depth > 0 ? "↳ " + item.info.title : item.info.title, systemImage: item.info.icon)
                    .tag(item.info.key)
            }
        }
        if allowNew {
            Button {
                showNew = true
            } label: {
                Label("Nova categoria ou subcategoria", systemImage: "plus.circle")
            }
            .sheet(isPresented: $showNew) {
                CategoryFormView(category: nil, isIncome: isIncome, parentKey: nil, suggestedParent: catalog.root(selection).key) { key in
                    selection = key
                }
            }
        }
    }
}

/// Criar ou editar uma categoria personalizada.
struct CategoryFormView: View {
    let category: CustomCategory?
    var onSaved: ((String) -> Void)?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \CustomCategory.createdAt) private var customCategories: [CustomCategory]
    @State private var title = ""
    @State private var isIncome: Bool
    @State private var parentKey: String
    @State private var color: Color
    @State private var error: String?
    private let suggestedParent: String?

    init(category: CustomCategory?, isIncome: Bool, parentKey: String?, suggestedParent: String? = nil, onSaved: ((String) -> Void)? = nil) {
        self.category = category
        self.onSaved = onSaved
        self.suggestedParent = suggestedParent
        _isIncome = State(initialValue: category?.isIncome ?? isIncome)
        _parentKey = State(initialValue: category?.parentKey ?? parentKey ?? "")
        _title = State(initialValue: category?.title ?? "")
        let hex = category?.colorHex ?? parentKey.map { CategoryCatalog().lookup($0).colorHex } ?? "#5E5CE6"
        _color = State(initialValue: Color(hex: hex))
    }

    private var catalog: CategoryCatalog { CategoryCatalog(customCategories) }
    private var hasSubcategories: Bool { category.map { !catalog.subcategories(of: $0.key).isEmpty } ?? false }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Tipo", selection: $isIncome) {
                        Text("Despesa").tag(false)
                        Text("Receita").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .disabled(!parentKey.isEmpty)
                    .onChange(of: isIncome) { _, _ in parentKey = "" }
                    TextField("Nome (ex.: Condomínio, Academia, Filhos)", text: $title)
                    ColorPicker("Cor", selection: $color, supportsOpacity: false)
                }
                Section {
                    Picker("Dentro de", selection: $parentKey) {
                        Text("Nenhuma — categoria principal").tag("")
                        ForEach(catalog.top(isIncome: isIncome).filter { $0.key != category?.key }) { c in
                            Label(c.title, systemImage: c.icon).tag(c.key)
                        }
                    }
                    .disabled(hasSubcategories)
                    .onChange(of: parentKey) { _, key in
                        if category == nil, !key.isEmpty { color = catalog.lookup(key).color }
                    }
                } footer: {
                    if hasSubcategories {
                        Text("Esta categoria tem subcategorias, por isso continua sendo principal.")
                    } else if let s = suggestedParent, parentKey.isEmpty, category == nil {
                        Text("Para criar uma subcategoria (ex.: \(catalog.lookup(s).title) › …), escolha a categoria em \"Dentro de\".")
                    } else {
                        Text("Escolha uma categoria para criar uma subcategoria (ex.: Moradia › Condomínio).")
                    }
                }
                if let error {
                    Text(error).foregroundStyle(.red).font(.callout)
                }
            }
            .navigationTitle(category == nil ? (parentKey.isEmpty ? "Nova categoria" : "Nova subcategoria") : "Editar categoria")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar", action: save)
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func save() {
        let name = title.trimmingCharacters(in: .whitespaces)
        let parent = parentKey.isEmpty ? nil : parentKey
        let income = parent.map { catalog.lookup($0).isIncome } ?? isIncome
        let clash = catalog.flat(isIncome: income).contains {
            $0.info.title.normalizedKey == name.normalizedKey && $0.info.parentKey == parent && $0.info.key != category?.key
        }
        if clash {
            error = "Já existe uma categoria com esse nome."
            return
        }
        let key: String
        if let category {
            category.title = name
            category.isIncome = income
            category.colorHex = color.hexString
            if !hasSubcategories { category.parentKey = parent }
            key = category.key
        } else {
            let c = CustomCategory(title: name, isIncome: income, colorHex: color.hexString, parentKey: parent)
            context.insert(c)
            key = c.key
        }
        try? context.save()
        onSaved?(key)
        dismiss()
    }
}

/// Ajustes › Categorias do orçamento.
struct CategoriesView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \CustomCategory.createdAt) private var customCategories: [CustomCategory]
    @Query private var transactions: [CashTransaction]
    @State private var editing: CustomCategory?
    @State private var creating: CreateRequest?
    @State private var deleting: CustomCategory?
    @State private var moveTo = ""

    struct CreateRequest: Identifiable {
        let id = UUID()
        let isIncome: Bool
        let parentKey: String?
    }

    var body: some View {
        let catalog = CategoryCatalog(customCategories)
        List {
            Section {
                Text("Crie categorias e subcategorias (ex.: Moradia › Condomínio). As categorias padrão não podem ser excluídas, mas aceitam subcategorias.")
                    .font(.callout).foregroundStyle(.secondary)
            }
            ForEach([false, true], id: \.self) { income in
                Section {
                    ForEach(catalog.top(isIncome: income)) { c in
                        row(c, depth: 0)
                        ForEach(catalog.subcategories(of: c.key)) { s in row(s, depth: 1) }
                    }
                    Button {
                        creating = CreateRequest(isIncome: income, parentKey: nil)
                    } label: {
                        Label("Nova categoria de \(income ? "receita" : "despesa")", systemImage: "plus.circle")
                    }
                } header: {
                    Text(income ? "Receitas" : "Despesas")
                }
            }
        }
        .navigationTitle("Categorias")
        .sheet(item: $creating) { req in
            CategoryFormView(category: nil, isIncome: req.isIncome, parentKey: req.parentKey)
        }
        .sheet(item: $editing) { c in
            CategoryFormView(category: c, isIncome: c.isIncome, parentKey: c.parentKey)
        }
        .sheet(item: $deleting) { c in
            deleteSheet(c, catalog: catalog)
        }
    }

    private func row(_ c: CategoryInfo, depth: Int) -> some View {
        HStack(spacing: 10) {
            if depth > 0 { Spacer().frame(width: 18) }
            Image(systemName: c.icon).foregroundStyle(c.color).frame(width: 22)
            Text(c.title)
            if !c.isBuiltin { Text("sua").font(.caption2).padding(.horizontal, 5).background(Color.secondary.opacity(0.15), in: Capsule()) }
            Spacer()
            if depth == 0 {
                Button {
                    creating = CreateRequest(isIncome: c.isIncome, parentKey: c.key)
                } label: {
                    Image(systemName: "plus.circle")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Nova subcategoria de \(c.title)")
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if let model = customCategories.first(where: { $0.key == c.key }) { editing = model }
        }
        .swipeActions {
            if let model = customCategories.first(where: { $0.key == c.key }) {
                Button(role: .destructive) {
                    moveTo = c.parentKey ?? (c.isIncome ? CashCategory.outrasReceitas.rawValue : CashCategory.outrosGastos.rawValue)
                    deleting = model
                } label: {
                    Label("Excluir", systemImage: "trash")
                }
            }
        }
    }

    private func deleteSheet(_ c: CustomCategory, catalog: CategoryCatalog) -> some View {
        let keys = Set([c.key] + catalog.subcategories(of: c.key).map(\.key))
        let used = transactions.filter { keys.contains($0.categoryRaw) }.count
        return NavigationStack {
            Form {
                if !catalog.subcategories(of: c.key).isEmpty {
                    Text("As subcategorias de \(c.title) também serão excluídas.")
                }
                if used > 0 {
                    Section {
                        Picker("Mover para", selection: $moveTo) {
                            ForEach(catalog.flat(isIncome: c.isIncome).filter { !keys.contains($0.info.key) }, id: \.info.key) { item in
                                Text(item.depth > 0 ? "↳ " + item.info.title : item.info.title).tag(item.info.key)
                            }
                        }
                    } header: {
                        Text("\(used) lançamento(s) usam esta categoria")
                    }
                } else {
                    Text("Nenhum lançamento usa esta categoria.").foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Excluir \(catalog.label(c.key))?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { deleting = nil } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Excluir", role: .destructive) {
                        CategoryStore.delete(c, moveTo: moveTo, in: context, catalog: catalog)
                        deleting = nil
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

@MainActor
enum CategoryStore {
    /// Exclui a categoria (e suas subcategorias), movendo os lançamentos e as regras aprendidas.
    @discardableResult
    static func delete(_ category: CustomCategory, moveTo: String, in context: ModelContext, catalog: CategoryCatalog) -> Int {
        let subs = ((try? context.fetch(FetchDescriptor<CustomCategory>())) ?? []).filter { $0.parentKey == category.key }
        let keys = Set([category.key] + subs.map(\.key))
        let target = keys.contains(moveTo) || !catalog.exists(moveTo)
            ? (category.isIncome ? CashCategory.outrasReceitas.rawValue : CashCategory.outrosGastos.rawValue)
            : moveTo
        let targetIncome = catalog.lookup(target).isIncome
        var moved = 0
        for t in (try? context.fetch(FetchDescriptor<CashTransaction>())) ?? [] where keys.contains(t.categoryRaw) {
            t.categoryRaw = target
            t.isIncome = targetIncome
            moved += 1
        }
        var rules = StatementImporter.loadRules()
        for (k, v) in rules where keys.contains(v) { rules[k] = target }
        StatementImporter.saveRules(rules)
        subs.forEach { context.delete($0) }
        context.delete(category)
        try? context.save()
        return moved
    }
}
