import Foundation

/// Carga contactos para Puente Caras (máx. 12 por llamada al Worker).
enum ContactStore {
    private static let maxContacts = 12
    private static let documentsFolder = "PuenteContacts"

    /// Contactos embebidos (generate-contacts-swift) + opcional en Documents del dispositivo.
    static func loadContacts() -> [RecognizeContactRef] {
        var merged = DemoContacts.all
        merged.append(contentsOf: loadFromDocuments())
        var seen = Set<String>()
        return merged.filter { ref in
            let key = ref.name.lowercased()
            guard !seen.contains(key) else { return false }
            seen.insert(key)
            return true
        }.prefix(maxContacts).map { $0 }
    }

    static func documentsDirectory() -> URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(documentsFolder, isDirectory: true)
    }

    /// Ruta en el iPhone para copiar fotos sin recompilar (Xcode → Devices → container).
    static var documentsHint: String {
        documentsDirectory().path
    }

    private static func loadFromDocuments() -> [RecognizeContactRef] {
        let dir = documentsDirectory()
        let manifest = dir.appendingPathComponent("contacts.json")
        guard FileManager.default.fileExists(atPath: manifest.path) else { return [] }
        return loadManifest(directory: dir, manifestURL: manifest)
    }

    private static func loadManifest(directory: URL, manifestURL: URL) -> [RecognizeContactRef] {
        guard let data = try? Data(contentsOf: manifestURL),
              let entries = try? JSONDecoder().decode([ContactManifestEntry].self, from: data)
        else { return [] }

        return entries.compactMap { entry in
            guard let b64 = imageBase64(filename: entry.photo, in: directory) else { return nil }
            return RecognizeContactRef(name: entry.name, relation: entry.relation, imageBase64: b64)
        }
    }

    private static func imageBase64(filename: String, in directory: URL) -> String? {
        let url = directory.appendingPathComponent(filename)
        guard let data = try? Data(contentsOf: url), !data.isEmpty else { return nil }
        return data.base64EncodedString()
    }
}

private struct ContactManifestEntry: Decodable {
    let name: String
    var relation: String?
    let photo: String
}
