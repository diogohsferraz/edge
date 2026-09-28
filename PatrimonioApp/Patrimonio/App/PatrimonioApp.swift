import SwiftUI
import SwiftData

@main
struct PatrimonioApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [
            Institution.self,
            Asset.self,
            BalanceSnapshot.self,
            Movement.self,
            CashTransaction.self,
        ])
    }
}

struct RootView: View {
    @AppStorage("lockEnabled") private var lockEnabled = false
    @AppStorage("selectedTab") private var tab = AppTab.dashboard
    @StateObject private var lock = AppLock()
    @StateObject private var benchmarks = BenchmarkStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView(selection: $tab) {
            DashboardView(selectedTab: $tab)
                .tabItem { Label("Início", systemImage: "chart.pie.fill") }
                .tag(AppTab.dashboard)
            PortfolioView()
                .tabItem { Label("Carteira", systemImage: "briefcase.fill") }
                .tag(AppTab.portfolio)
            UpdateBalancesView()
                .tabItem { Label("Atualizar", systemImage: "arrow.triangle.2.circlepath") }
                .tag(AppTab.update)
            CashFlowView()
                .tabItem { Label("Orçamento", systemImage: "creditcard.fill") }
                .tag(AppTab.cashFlow)
            SettingsView()
                .tabItem { Label("Ajustes", systemImage: "gearshape.fill") }
                .tag(AppTab.settings)
        }
        .environmentObject(benchmarks)
        .environmentObject(lock)
        .overlay {
            if lockEnabled && !lock.isUnlocked {
                LockScreen()
                    .environmentObject(lock)
                    .transition(.opacity)
            }
        }
        .onAppear {
            if lockEnabled { lock.authenticate() }
        }
        .onChange(of: scenePhase) { _, phase in
            guard lockEnabled else { return }
            switch phase {
            case .background: lock.lock()
            case .active: lock.authenticate()
            default: break
            }
        }
        .task { await benchmarks.refreshIfNeeded() }
    }
}

enum AppTab: String {
    case dashboard, portfolio, update, cashFlow, settings
}

struct LockScreen: View {
    @EnvironmentObject private var lock: AppLock

    var body: some View {
        ZStack {
            Rectangle().fill(.ultraThickMaterial).ignoresSafeArea()
            VStack(spacing: 20) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.tint)
                Text("Patrimônio bloqueado")
                    .font(.title2.bold())
                Button {
                    lock.authenticate()
                } label: {
                    Label("Desbloquear com \(lock.biometryName)", systemImage: "faceid")
                        .padding(.horizontal, 8)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}
