import SwiftUI
import UIKit

// MARK: - Cartão

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }
}

struct CardHeader<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                if let subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            trailing()
        }
    }
}

extension CardHeader where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = { EmptyView() }
    }
}

// MARK: - Campo de valor

/// Campo numérico com teclado decimal, aceita "1.234,56".
struct CurrencyField: View {
    let placeholder: String
    @Binding var text: String
    var alignment: TextAlignment = .trailing

    init(_ placeholder: String, text: Binding<String>, alignment: TextAlignment = .trailing) {
        self.placeholder = placeholder
        self._text = text
        self.alignment = alignment
    }

    var body: some View {
        HStack(spacing: 4) {
            Text("R$").foregroundStyle(.secondary)
            TextField(placeholder, text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(alignment)
                .monospacedDigit()
        }
    }
}

// MARK: - Ícones

struct IconBadge: View {
    let systemName: String
    let color: Color
    var size: CGFloat = 34

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color.gradient, in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
    }
}

struct InstitutionBadge: View {
    let name: String
    let colorHex: String
    var size: CGFloat = 34

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hex: colorHex).gradient, in: Circle())
    }

    private var initials: String {
        let words = name.split(separator: " ").filter { $0.first?.isLetter == true }
        let letters = words.prefix(2).compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}

// MARK: - Variação

struct ChangeLabel: View {
    let value: Double
    var percent: Double?
    var hidden: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: value >= 0 ? "arrow.up.right" : "arrow.down.right")
                .font(.caption2.weight(.bold))
            Text(Fmt.signedCurrency(value, hidden: hidden))
            if let percent {
                Text("(\(Fmt.percent(percent, signed: true)))")
            }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(value >= 0 ? Color.green : Color.red)
        .monospacedDigit()
    }
}

struct LegendDot: View {
    let color: Color
    let label: String
    var dashed = false

    var body: some View {
        HStack(spacing: 6) {
            if dashed {
                Capsule().stroke(color, style: StrokeStyle(lineWidth: 2, dash: [3, 2])).frame(width: 14, height: 2)
            } else {
                Circle().fill(color).frame(width: 8, height: 8)
            }
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }
}

// MARK: - Compartilhar arquivo

struct ShareFile: Identifiable {
    let id = UUID()
    let url: URL
}

struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

// MARK: - Período dos gráficos

enum ChartPeriod: String, CaseIterable, Identifiable {
    case sixMonths = "6M"
    case oneYear = "1A"
    case twoYears = "2A"
    case fiveYears = "5A"
    case all = "Tudo"

    var id: String { rawValue }

    var months: Int? {
        switch self {
        case .sixMonths: return 6
        case .oneYear: return 12
        case .twoYears: return 24
        case .fiveYears: return 60
        case .all: return nil
        }
    }
}
