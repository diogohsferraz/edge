import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct SettingsView: View {
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var benchmarks: BenchmarkStore
    @EnvironmentObject private var lock: AppLock
    @Query private var assets: [Asset]
    @Query private var transactions: [CashTransaction]
    @Query private var customCategories: [CustomCategory]

    @AppStorage("hideValues") private var hideValues = false
    @AppStorage("lockEnabled") private var lockEnabled = false
    @AppStorage("goalValue") private var goalValue: Double = 0

    @State private var goalText = ""
    @State private var showImporter = false
    @State private var importResult: String?
    @State private var shareFile: ShareFile?
    @State private var statementFile: StatementFile?
    @State private var confirmWipe = false
    @State private var confirmSample = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    NavigationLink {
                        InstitutionsListView()
                    } label: {
                        Label("Bancos e corretoras", systemImage: "building.columns")
                    }
                    NavigationLink {
                        CategoriesView()
                    } label: {
                        Label("Categorias do orçamento", systemImage: "tag")
                    }
                }

                Section {
                    CurrencyField("Ex.: 1.000.000", text: $goalText)
                        .onSubmit(saveGoal)
                        .onChange(of: goalText) { _, _ in saveGoal() }
                } header: {
                    Text("Meta de patrimônio")
                } footer: {
                    Text("Aparece no painel com o progresso e a estimativa de quando você chega lá. Deixe vazio para ocultar.")
                }

                Section("Privacidade") {
                    Toggle(isOn: $hideValues) {
                        Label("Ocultar valores", systemImage: "eye.slash")
                    }
                    Toggle(isOn: $lockEnabled) {
                        Label("Bloquear com \(lock.biometryName)", systemImage: "faceid")
                    }
                    .onChange(of: lockEnabled) { _, enabled in
                        // Mantém o app desbloqueado na sessão atual ao ativar.
                        if enabled { lock.isUnlocked = true }
                    }
                }

                Section {
                    Button {
                        showImporter = true
                    } label: {
                        Label("Importar planilha ou extrato (CSV)", systemImage: "square.and.arrow.down")
                    }
                    NavigationLink {
                        ImportHelpView()
                    } label: {
                        Label("Como preparar sua planilha", systemImage: "questionmark.circle")
                    }
                    Button {
                        export(name: "patrimonio.csv", contents: CSVService.exportCSV(assets: assets))
                    } label: {
                        Label("Exportar investimentos (CSV)", systemImage: "square.and.arrow.up")
                    }
                    .disabled(assets.isEmpty)
                    Button {
                        export(name: "orcamento.csv", contents: CSVService.exportTransactionsCSV(transactions, catalog: CategoryCatalog(customCategories)))
                    } label: {
                        Label("Exportar receitas e despesas (CSV)", systemImage: "square.and.arrow.up")
                    }
                    .disabled(transactions.isEmpty)
                } header: {
                    Text("Planilhas")
                } footer: {
                    Text("Os arquivos exportados abrem no Excel, Numbers e Google Planilhas.")
                }

                Section {
                    LabeledContent("Última atualização") {
                        if let d = benchmarks.lastUpdated {
                            Text(Fmt.day.string(from: d))
                        } else {
                            Text("Nunca")
                        }
                    }
                    Button {
                        Task { await benchmarks.refresh() }
                    } label: {
                        HStack {
                            Label("Atualizar CDI e IPCA", systemImage: "arrow.clockwise")
                            if benchmarks.isLoading {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    if let error = benchmarks.lastError {
                        Text(error).font(.caption).foregroundStyle(.red)
                    }
                } header: {
                    Text("Indicadores")
                } footer: {
                    Text("Dados públicos do Banco Central (SGS) usados para comparar a rentabilidade da carteira.")
                }

                Section("Dados") {
                    Button {
                        confirmSample = true
                    } label: {
                        Label("Carregar dados de exemplo", systemImage: "wand.and.stars")
                    }
                    Button(role: .destructive) {
                        confirmWipe = true
                    } label: {
                        Label("Apagar todos os dados", systemImage: "trash")
                    }
                }

                Section {
                    LabeledContent("Versão", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
                    Text("Seus dados ficam apenas neste iPhone. Nenhuma senha de banco é solicitada: você informa os saldos manualmente ou importa sua planilha.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Ajustes")
            .onAppear {
                goalText = goalValue > 0 ? Fmt.editable(goalValue) : ""
            }
            .fileImporter(
                isPresented: $showImporter,
                allowedContentTypes: [.commaSeparatedText, .tabSeparatedText, .plainText, .text],
                allowsMultipleSelection: false
            ) { result in
                handleImport(result)
            }
            .alert("Importação", isPresented: Binding(get: { importResult != nil }, set: { if !$0 { importResult = nil } })) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(importResult ?? "")
            }
            .sheet(item: $shareFile) { file in
                ActivityView(items: [file.url])
                    .presentationDetents([.medium, .large])
            }
            .sheet(item: $statementFile) { file in
                StatementImportView(text: file.text) { added, _ in
                    importResult = "\(added) lançamento(s) importado(s) no Orçamento."
                }
            }
            .confirmationDialog("Apagar todos os dados?", isPresented: $confirmWipe, titleVisibility: .visible) {
                Button("Apagar tudo", role: .destructive) {
                    PortfolioStore.deleteEverything(in: context)
                }
            } message: {
                Text("Instituições, investimentos, históricos e lançamentos serão apagados. Esta ação não pode ser desfeita. Exporte um CSV antes se quiser guardar uma cópia.")
            }
            .confirmationDialog("Carregar dados de exemplo?", isPresented: $confirmSample, titleVisibility: .visible) {
                Button("Carregar exemplo") { SampleData.load(into: context) }
            } message: {
                Text("Serão adicionados investimentos e lançamentos fictícios aos seus dados atuais. Você pode apagá-los depois em \"Apagar todos os dados\".")
            }
        }
    }

    private func saveGoal() {
        goalValue = max(Fmt.parseNumber(goalText) ?? 0, 0)
    }

    private func export(name: String, contents: String) {
        do {
            let url = try CSVService.writeTemporaryFile(named: name, contents: contents)
            shareFile = ShareFile(url: url)
        } catch {
            importResult = "Não foi possível gerar o arquivo: \(error.localizedDescription)"
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            importResult = error.localizedDescription
        case .success(let urls):
            guard let url = urls.first else { return }
            let accessing = url.startAccessingSecurityScopedResource()
            defer { if accessing { url.stopAccessingSecurityScopedResource() } }
            do {
                let data = try Data(contentsOf: url)
                let text = CSVService.decodeText(data)
                if let header = CSVService.parseRows(text).first, StatementImporter.isStatement(header: header) {
                    statementFile = StatementFile(text: text)
                    return
                }
                let summary = try CSVService.importCSV(text: text, into: context)
                importResult = summary.description
            } catch {
                importResult = error.localizedDescription
            }
        }
    }
}

struct ImportHelpView: View {
    @State private var shareFile: ShareFile?

    var body: some View {
        List {
            Section {
                Text("No Excel ou Google Planilhas, use **Arquivo › Salvar como / Fazer download › CSV**. Depois salve o arquivo no app Arquivos (ou iCloud Drive) e importe por aqui.")
                    .font(.callout)
            }

            Section {
                Text("Uma coluna por mês, cada linha é um investimento. É o formato mais comum de planilha de patrimônio.")
                    .font(.callout)
                code("""
                instituicao;ativo;classe;01/2026;02/2026;03/2026
                Nubank;Caixinha;Conta;10.000;10.450;10.980
                XP;CDB 110% CDI;Renda Fixa;25.000;25.260;25.530
                XP;Tesouro IPCA+ 2035;Tesouro;8.000;8.120;8.090
                """)
            } header: {
                Text("Formato 1 — saldos por mês")
            } footer: {
                Text("O primeiro saldo de cada investimento é considerado aporte inicial. Aportes posteriores podem ser registrados no app.")
            }

            Section {
                Text("Uma linha por lançamento. Permite informar aportes, resgates e proventos para uma rentabilidade exata.")
                    .font(.callout)
                code(CSVService.sampleTemplate)
                Button {
                    if let url = try? CSVService.writeTemporaryFile(named: "modelo-patrimonio.csv", contents: CSVService.sampleTemplate) {
                        shareFile = ShareFile(url: url)
                    }
                } label: {
                    Label("Baixar modelo", systemImage: "arrow.down.doc")
                }
            } header: {
                Text("Formato 2 — lançamentos")
            }

            Section("Regras") {
                bullet("Separador ponto e vírgula (;), vírgula ou tab.")
                bullet("Datas: 31/01/2026, 2026-01-31 ou, no formato 1, 01/2026.")
                bullet("Valores: 1.234,56 ou 1234.56 (com ou sem R$).")
                bullet("Colunas reconhecidas: data, instituição/banco/corretora, ativo/investimento, classe/tipo, saldo/valor, aporte, resgate, proventos, ticker.")
                bullet("Classes: Conta, Renda Fixa (CDB, LCI, LCA…), Tesouro, Ações, FII, Fundos, Previdência, Cripto, Exterior. Se não informar, o app tenta adivinhar pelo nome.")
                bullet("Importar de novo o mesmo mês substitui o saldo daquele dia, sem duplicar.")
            }
        }
        .navigationTitle("Importar planilha")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $shareFile) { file in
            ActivityView(items: [file.url])
        }
    }

    private func code(_ text: String) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            Text(text)
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
                .padding(10)
        }
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
            Text(text).font(.callout)
        }
    }
}
