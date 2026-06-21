import SwiftUI

struct DeviceSessionManagerView: View {
    @EnvironmentObject private var vm: PuenteViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var busyAction: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    overviewSection
                    moduleSection
                    networkSection
                    datSection
                    devicesSection
                    streamSection
                    actionsSection
                }
                .padding(16)
            }
            .background(Color(red: 0.04, green: 0.04, blue: 0.05))
            .navigationTitle("Sesión DAT")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cerrar") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await vm.refreshDeviceSession() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(busyAction != nil)
                }
            }
            .preferredColorScheme(.dark)
        }
    }

    private var overviewSection: some View {
        SessionCard(title: "Estado general") {
            StatusRow(
                label: "App Puente",
                value: vm.live ? "En vivo" : vm.status,
                tone: vm.live ? .ok : .neutral
            )
            StatusRow(
                label: "Registro Meta",
                value: vm.deviceSession.registrationState,
                tone: vm.deviceSession.isRegistered ? .ok : .warn
            )
            StatusRow(
                label: "Modo",
                value: vm.deviceSession.useMockDevice ? "Mock (simulador)" : "Gafas reales",
                tone: vm.deviceSession.useMockDevice ? .neutral : .ok
            )
            StatusRow(
                label: "Módulo activo",
                value: vm.deviceSession.activeModule,
                tone: .ok
            )
        }
    }

    private var moduleSection: some View {
        SessionCard(title: "Módulos Puente") {
            ForEach(PuenteModule.allCases) { mod in
                Button {
                    Task { await vm.switchModule(mod) }
                } label: {
                    HStack {
                        Text(mod.displayName)
                        Spacer()
                        if vm.activeModule == mod {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                    }
                    .font(.subheadline)
                    .padding(.vertical, 6)
                }
            }
            Text("También por voz: «modo cruce», «modo super», «modo guía», «modo Mac».")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var networkSection: some View {
        SessionCard(title: "Red / Worker") {
            StatusRow(
                label: "Worker",
                value: vm.deviceSession.workerReachable ? "Alcanzable" : "Sin conexión",
                tone: vm.deviceSession.workerReachable ? .ok : .error
            )
            InfoRow(label: "URL worker", value: vm.deviceSession.workerURL)
            InfoRow(label: "URL Mac commands", value: vm.deviceSession.commandURL)
            InfoRow(label: "URL cruce WS", value: vm.deviceSession.crossingWSURL)
        }
    }

    private var datSection: some View {
        SessionCard(title: "Sesión DAT") {
            StatusRow(
                label: "Sesión",
                value: vm.deviceSession.datSessionState,
                tone: vm.deviceSession.datSessionState == "started" ? .ok : .warn
            )
            StatusRow(
                label: "Permiso cámara",
                value: vm.deviceSession.cameraPermission ?? "—",
                tone: vm.deviceSession.cameraPermission == "granted" ? .ok : .warn
            )
            if let selected = vm.deviceSession.selectedDeviceId {
                InfoRow(label: "Dispositivo activo", value: selected)
            }
        }
    }

    private var devicesSection: some View {
        SessionCard(title: "Dispositivos Meta AI") {
            if vm.deviceSession.devices.isEmpty {
                Text("Sin gafas detectadas. Abre Meta AI y conecta las Ray-Ban.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(vm.deviceSession.devices) { device in
                    DeviceRowView(device: device)
                }
            }
        }
    }

    private var streamSection: some View {
        SessionCard(title: "Stream de cámara") {
            StatusRow(
                label: "Estado",
                value: vm.deviceSession.streamState,
                tone: vm.deviceSession.isStreaming ? .ok : .warn
            )
            StatusRow(
                label: "Frames",
                value: "\(vm.deviceSession.frameCount)",
                tone: vm.deviceSession.frameCount > 0 ? .ok : .neutral
            )
            StatusRow(
                label: "Frame reciente",
                value: vm.deviceSession.hasRecentFrame ? "Sí (<3s)" : "No",
                tone: vm.deviceSession.hasRecentFrame ? .ok : .warn
            )
            StreamView(stream: vm.streamSession) {
                await vm.ensureCameraStreamStarted()
            }
        }
    }

    private var actionsSection: some View {
        SessionCard(title: "Acciones") {
            actionButton("Abrir Meta AI", systemImage: "app.badge") {
                vm.openMetaAI()
            }
            actionButton("Registrar app en Meta", systemImage: "person.crop.circle.badge.plus") {
                await vm.requestRegistration()
            }
            actionButton("Refrescar permiso cámara", systemImage: "camera") {
                await vm.refreshCameraPermission()
            }
            actionButton("Reiniciar sesión DAT", systemImage: "arrow.triangle.2.circlepath", destructive: true) {
                await vm.restartDeviceSession()
            }
            Text("Actualizado: \(vm.deviceSession.lastUpdated.formatted(date: .omitted, time: .standard))")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        }
    }

    private func actionButton(
        _ title: String,
        systemImage: String,
        destructive: Bool = false,
        action: @escaping () async -> Void
    ) -> some View {
        Button {
            guard busyAction == nil else { return }
            busyAction = title
            Task {
                await action()
                busyAction = nil
            }
        } label: {
            HStack {
                Image(systemName: systemImage)
                Text(title)
                Spacer()
                if busyAction == title {
                    ProgressView()
                }
            }
            .font(.subheadline.weight(.medium))
            .foregroundStyle(destructive ? Color.red.opacity(0.9) : .primary)
            .padding(.vertical, 10)
        }
        .disabled(busyAction != nil && busyAction != title)
    }
}

// MARK: - Subviews

private struct SessionCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
            VStack(alignment: .leading, spacing: 8) {
                content
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(white: 0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

private enum StatusTone {
    case ok, warn, error, neutral

    var color: Color {
        switch self {
        case .ok: Color(red: 0.2, green: 0.7, blue: 0.45)
        case .warn: Color(red: 0.85, green: 0.65, blue: 0.2)
        case .error: Color(red: 0.85, green: 0.3, blue: 0.3)
        case .neutral: Color.secondary
        }
    }
}

private struct StatusRow: View {
    let label: String
    let value: String
    let tone: StatusTone

    var body: some View {
        HStack(alignment: .top) {
            Circle()
                .fill(tone.color)
                .frame(width: 8, height: 8)
                .padding(.top, 5)
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(value)
                .font(.subheadline.weight(.medium))
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption2.monospaced())
                .foregroundStyle(.primary)
        }
    }
}

private struct DeviceRowView: View {
    let device: DeviceSessionRow

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(device.name)
                    .font(.subheadline.weight(.semibold))
                if device.isSelected {
                    Text("ACTIVO")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.green)
                }
            }
            HStack(spacing: 12) {
                Label(device.linkState, systemImage: "antenna.radiowaves.left.and.right")
                    .font(.caption)
                    .foregroundStyle(device.linkState == "connected" ? .green : .orange)
                Label(device.compatibility, systemImage: "checkmark.shield")
                    .font(.caption)
                    .foregroundStyle(device.compatibility == "compatible" ? .green : .orange)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    DeviceSessionManagerView()
        .environmentObject(PuenteViewModel())
}
