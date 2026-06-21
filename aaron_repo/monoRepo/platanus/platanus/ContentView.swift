//
//  ContentView.swift
//  platanus
//
//  Created by Aaron on 20/06/26.
//

import SwiftUI

#if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
import MWDATCore
#endif

struct ContentView: View {
    @State var logText: String = "Desconectado"
    @State var isConnected = false
    @State var isStreaming = false
    
    // El cliente de Websockets y el manejador de las gafas se inicializan de forma persistente.
    @State var client = StreamingClient(sessionId: "session_prueba_fisica", host: "10.0.96.190:8000")
    @State var glassesManager = MetaGlassesManager()
    
    // Puentes de delegados persistidos
    @State private var glassesDelegate: GlassesDelegateBridge?
    @State private var clientDelegate: ClientDelegateBridge?
    
    var body: some View {
        VStack(spacing: 30) {
            Text("Platanus Hack - Companion App")
                .font(.title2)
                .bold()
                .padding(.top)
            
            VStack(alignment: .leading, spacing: 10) {
                Text("Estado: \(logText)")
                    .font(.subheadline)
                    .foregroundColor(isConnected ? .green : .red)
                
                Text("Streaming: \(isStreaming ? "ACTIVO" : "INACTIVO")")
                    .font(.subheadline)
                    .foregroundColor(isStreaming ? .blue : .gray)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(.secondarySystemBackground))
            .cornerRadius(10)
            
            Button(action: {
                #if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
                Task {
                    do {
                        try await Wearables.shared.startRegistration()
                        logText = "Abriendo Meta View para registro..."
                    } catch {
                        logText = "Error de registro: \(error.localizedDescription)"
                    }
                }
                #else
                logText = "Registro no disponible en simulador"
                #endif
            }) {
                Text("Vincular Gafas en Meta View")
                    .bold()
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            
            Button(action: {
                if isConnected {
                    print("[ContentView] Desconectando sockets y deteniendo captura...")
                    client.disconnect()
                    glassesManager.stopCapture()
                    isStreaming = false
                    isConnected = false
                    logText = "Desconectado"
                } else {
                    print("[ContentView] Conectando sockets e iniciando captura de audio y video...")
                    client.connect()
                    isConnected = true
                    logText = "Sockets Conectados"
                    Task {
                        do {
                            try await glassesManager.startCapture()
                        } catch {
                            print("[ContentView] Error al iniciar la captura: \(error)")
                        }
                    }
                }
            }) {
                Text(isConnected ? "Desconectar Sockets" : "Conectar Sockets")
                    .bold()
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isConnected ? Color.red : Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            
            Button(action: {
                // Envía comando simulado al servidor para arrancar el flujo de mapas
                client.sendTranscriptText("Hola Aaron, vamos al super más cercano a comprar leche")
                logText = "Wake Command Enviado (Mapas)"
            }) {
                Text("Simular: Ir al súper cercano")
                    .bold()
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isConnected ? Color.blue : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            .disabled(!isConnected)
            
            Button(action: {
                // Envía comando simulado para guiar al usuario a un objetivo visual (puerta)
                client.sendTranscriptText("Ey Aaron, quiero llegar a la puerta")
                logText = "Wake Command Enviado (Visual)"
            }) {
                Text("Simular: Llegar a la puerta")
                    .bold()
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isConnected ? Color.purple : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            .disabled(!isConnected)
            
            Button(action: {
                // Envía comando de voz de parada/cancelación
                client.sendTranscriptText("Ey Aaron, cancela la navegación")
                logText = "Wake Command Enviado (Cancelar)"
            }) {
                Text("Simular: Cancelar Navegación")
                    .bold()
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isConnected ? Color.orange : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            .disabled(!isConnected)
            
            Spacer()
        }
        .padding()
        .onAppear {
            setupDelegates()
            #if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
            Task {
                for await state in Wearables.shared.registrationStateStream() {
                    logText = "Estado Meta: \(state)"
                }
            }
            #endif
        }
    }
    
    private func setupDelegates() {
        let gDelegate = GlassesDelegateBridge(parent: self)
        let cDelegate = ClientDelegateBridge(parent: self)
        
        self.glassesDelegate = gDelegate
        self.clientDelegate = cDelegate
        
        glassesManager.delegate = gDelegate
        client.delegate = cDelegate
    }
}

// Clases puente delegadas para SwiftUI
@MainActor
class GlassesDelegateBridge: MetaGlassesManagerDelegate {
    let parent: ContentView
    
    init(parent: ContentView) {
        self.parent = parent
    }
    
    func glassesManager(_ manager: MetaGlassesManager, didCaptureAudioChunk data: Data) {
        parent.client.sendAudioData(data)
    }
    
    func glassesManager(_ manager: MetaGlassesManager, didCaptureVideoFrame jpegData: Data) {
        parent.client.sendVideoFrame(jpegData)
    }
    
    func glassesManager(_ manager: MetaGlassesManager, didChangeState state: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            print("[Glasses] \(state)")
            self.parent.logText = state
        }
    }
    
    func glassesManager(_ manager: MetaGlassesManager, didRecognizeSpeechText text: String) {
        // Enviar la transcripción en vivo al backend por el socket de audio
        parent.client.sendTranscriptText(text)
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.parent.logText = "Voz: \(text)"
        }
    }
}

class ClientDelegateBridge: StreamingClientDelegate {
    let parent: ContentView
    
    init(parent: ContentView) {
        self.parent = parent
    }
    
    func streamingClient(_ client: StreamingClient, didReceiveStartPerceptualLoop payload: [String : Any]) {
        DispatchQueue.main.async {
            self.parent.logText = "Flujo Perceptual Activo"
            self.parent.isStreaming = true
            Task {
                try? await self.parent.glassesManager.startCapture()
            }
        }
    }
    
    func streamingClient(_ client: StreamingClient, didChangeConnectionStatus isConnected: Bool, channel: String) {
        DispatchQueue.main.async {
            print("[Client] Canal \(channel) conectado: \(isConnected)")
        }
    }
}

#Preview {
    ContentView()
}

