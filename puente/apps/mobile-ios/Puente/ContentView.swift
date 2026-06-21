import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var vm: PuenteViewModel

    var body: some View {
        NavigationStack {
            mainContent
        }
    }

    private var mainContent: some View {
        VStack(spacing: 0) {
            banner
            if !vm.glassesReady {
                waitingCard
            }
            if vm.live && vm.glassesReady {
                StreamView(stream: vm.streamSession) {
                    await vm.ensureCameraStreamStarted()
                }
                .padding(.top, 12)
                .frame(maxHeight: .infinity)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if vm.listening {
                        Text(vm.partialTranscript.isEmpty ? "Escuchando… di dónde está la leche, agrega leche a mi lista, etc." : vm.partialTranscript)
                            .font(.title3)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(Array(vm.said.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.title2)
                            .foregroundStyle(line.hasPrefix("Tú:") ? .cyan : .primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.top, 24)
            }
            // Con la cámara en grande, el transcript ocupa una franja fija abajo;
            // sin streaming activo, vuelve a llenar la pantalla.
            .frame(maxHeight: vm.live && vm.glassesReady ? 170 : .infinity)
            #if DEBUG
            debugLog
            #endif
        }
        .padding(.horizontal, 16)
        .padding(.top, 56)
        .background(Color(red: 0.04, green: 0.04, blue: 0.05))
        .preferredColorScheme(.dark)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    vm.showDeviceSessionManager = true
                } label: {
                    Image(systemName: "eyeglasses")
                }
                .accessibilityLabel("Gestor de sesión DAT")
            }
        }
        .sheet(isPresented: $vm.showDeviceSessionManager) {
            DeviceSessionManagerView()
                .environmentObject(vm)
        }
        .sheet(isPresented: $vm.showOnboardingDisclaimer) {
            OnboardingDisclaimerView()
                .environmentObject(vm)
        }
    }

    private var banner: some View {
        Text(bannerText)
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(20)
            .background(bannerColor)
            .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var bannerText: String {
        if !vm.glassesReady { return vm.connectionPhase.bannerText }
        let moduleHint = vm.activeModule.bannerHint
        if vm.listening { return "● ESCUCHANDO — \(moduleHint)" }
        switch vm.status {
        case PuenteSessionState.processing.rawValue:
            return "● ANALIZANDO — \(vm.activeModule.displayName)"
        case PuenteSessionState.speaking.rawValue:
            return "● HABLANDO — \(vm.activeModule.displayName)"
        case PuenteSessionState.sentidoContinuous.rawValue:
            return "● EN VIVO — \(moduleHint)"
        default:
            break
        }
        if vm.live { return "● \(vm.activeModule.displayName.uppercased()) — \(moduleHint)" }
        return vm.status
    }

    private var bannerColor: Color {
        if !vm.glassesReady { return Color(red: 0.35, green: 0.28, blue: 0.12) }
        if vm.listening { return Color(red: 0.22, green: 0.42, blue: 0.62) }
        if vm.status == PuenteSessionState.processing.rawValue {
            return Color(red: 0.45, green: 0.32, blue: 0.12)
        }
        if vm.status == PuenteSessionState.speaking.rawValue {
            return Color(red: 0.35, green: 0.28, blue: 0.55)
        }
        if vm.live { return Color(red: 0.18, green: 0.52, blue: 0.35) }
        return Color(red: 0.18, green: 0.22, blue: 0.28)
    }

    private var waitingCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(vm.connectionPhase.hint)
                .font(.body)
                .foregroundStyle(.secondary)
            if vm.connectionPhase.needsMetaAI {
                Button {
                    vm.openMetaAI()
                } label: {
                    Label("Abrir Meta AI", systemImage: "app.badge")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            Button {
                Task { await vm.requestRegistration() }
            } label: {
                Label("Reintentar registro / permisos", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding(16)
        .background(Color(white: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.top, 12)
    }

    #if DEBUG
    private var debugLog: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(vm.logs.suffix(40).enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxHeight: 140)
        .padding(.top, 8)
    }
    #endif
}

#Preview {
    ContentView().environmentObject(PuenteViewModel())
}
