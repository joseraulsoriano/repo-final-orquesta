import SwiftUI

struct OnboardingDisclaimerView: View {
    @EnvironmentObject private var vm: PuenteViewModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Puente es asistencia, no sustituto de un guía humano ni de tu criterio. Las descripciones de visión y cruce pueden fallar: verifica siempre con tus sentidos y el entorno real.")
                        .font(.body)
                    Text("Los módulos (super, cruce, guía, Mac) comparten una sola sesión con las gafas. Cambia de modo diciendo «modo cruce», «modo super», «modo guía» o «modo Mac».")
                        .font(.body)
                        .foregroundStyle(.secondary)
                    Text("El modo cruce usa detección automática en tu red local; no garantiza seguridad en calle.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .padding(20)
            }
            .navigationTitle("Antes de empezar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Entendido") {
                        vm.dismissOnboardingDisclaimer()
                    }
                    .fontWeight(.semibold)
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}

#Preview {
    OnboardingDisclaimerView()
        .environmentObject(PuenteViewModel())
}
