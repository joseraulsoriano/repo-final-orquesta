import SwiftUI

/// Capa pura de display del stream DAT (patrón Meta: StreamView).
/// El arranque del stream ocurre al montarse, como EMWDATStreamView en mobile-rn.
struct StreamView: View {
    @ObservedObject var stream: StreamSessionViewModel
    var onStart: (() async -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Cámara gafas")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text(stream.streamStateLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(white: 0.12))
                if let image = stream.previewImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    VStack(spacing: 8) {
                        ProgressView()
                        Text("Esperando frames…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            Text(stream.frameLabel.isEmpty ? "Sin frames aún" : stream.frameLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .task {
            await onStart?()
        }
    }
}

#Preview {
    StreamView(stream: StreamSessionViewModel())
        .padding()
        .background(Color.black)
        .preferredColorScheme(.dark)
}
