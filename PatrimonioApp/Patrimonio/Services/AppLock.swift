import Foundation
import LocalAuthentication

/// Bloqueio do app com Face ID / Touch ID / código do iPhone.
@MainActor
final class AppLock: ObservableObject {
    @Published var isUnlocked = false
    @Published private(set) var isAuthenticating = false

    var biometryName: String {
        let ctx = LAContext()
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch ctx.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return "código do iPhone"
        }
    }

    func authenticate() {
        guard !isAuthenticating, !isUnlocked else { return }
        let ctx = LAContext()
        var error: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            // Sem biometria nem código configurado: não bloqueia o usuário fora do app.
            isUnlocked = true
            return
        }
        isAuthenticating = true
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Desbloqueie para ver seu patrimônio") { success, _ in
            Task { @MainActor in
                self.isAuthenticating = false
                self.isUnlocked = success
            }
        }
    }

    func lock() {
        isUnlocked = false
    }
}
