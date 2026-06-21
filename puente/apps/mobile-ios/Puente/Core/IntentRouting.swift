import Foundation

enum UserIntent: String {
    case add, whereItem, whereAmI, whatIs, whatsLeft, who, yes, no, unknown
}

private let addRE = try! NSRegularExpression(
    pattern: #"\b(agrega|agregar|agr[eé]game|añade|anade|añadir|anadir|apunta|an[oó]tame|anota|pon|p[oó]n)\b"#,
    options: [.caseInsensitive]
)

private let productRE = try! NSRegularExpression(
    pattern: #"\b(leche|pan|huevo|arroz|aceite|yogurt|atún|atun|frijol|sal|azúcar|azucar|producto|yogur|mantequilla|queso|cereal|jabón|jabon|papel|refresco|agua|carne|pollo|fruta|verdura)\b"#,
    options: [.caseInsensitive]
)

private let searchRE = try! NSRegularExpression(
    pattern: #"\b(buscando|buscar|encontrar|encontrando|localizar|localizando|consigue|conseguir|ubicar|ubica|ubícame|ubicame)\b"#,
    options: [.caseInsensitive]
)

private func hasProductMention(_ s: String) -> Bool {
    let ns = s as NSString
    return productRE.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) != nil
        || s.range(of: #"\b(la|el|los|las)\s+\w{3,}"#, options: .regularExpression) != nil
}

/// Frases conversacionales: "¿me ayudas buscando la leche?", "necesito encontrar pan".
private func isLookingForProduct(_ s: String) -> Bool {
    let ns = s as NSString
    guard hasProductMention(s) else { return false }
    if s.contains("dónde") || s.contains("donde") { return true }
    if searchRE.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) != nil { return true }
    if s.range(of: #"\b(ayuda|ayudar|ayúdame|ayudame|apoya|puedes|podrías|podrias|me\s+puedes|me\s+puedas)\b"#, options: .regularExpression) != nil,
       s.range(of: #"\b(busc|encontr|localiz|ubic)\b"#, options: .regularExpression) != nil {
        return true
    }
    if s.range(of: #"\b(necesito|quiero|andaba\s+buscando)\b"#, options: .regularExpression) != nil {
        return true
    }
    return false
}

func intentOf(_ t: String) -> UserIntent {
    let s = t.lowercased()
    if s.range(of: #"\b(s[ií]|claro|d[aá]le|t[oó]malo)\b"#, options: .regularExpression) != nil { return .yes }
    if s.range(of: #"\b(no|nop|nel)\b"#, options: .regularExpression) != nil,
       !s.contains("normal") && !s.contains("correo") { return .no }
    let ns = s as NSString
    if addRE.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) != nil {
        if s.contains("lista") || s.contains("compr") { return .add }
        if hasProductMention(s) { return .add }
    }
    if s.contains("falta") || s.contains("qué llevo") || s.contains("que llevo") { return .whatsLeft }
    if s.range(of: #"\bqui[eé]n\b"#, options: .regularExpression) != nil ||
        s.contains("reconoce") || s.contains("reconocer") ||
        s.contains("con quién") || s.contains("con quien") ||
        (s.contains("cerca") && s.range(of: #"\b(amig|conocid|persona)\b"#, options: .regularExpression) != nil) {
        return .who
    }
    if isWhereAmIQuestion(s) { return .whereAmI }
    if isLookingForProduct(s) { return .whereItem }
    if s.contains("dónde") || s.contains("donde") { return .whereItem }
    if s.contains("qué es") || s.contains("que es") || s.contains("qué producto") ||
        s.contains("este") || s.contains("esto") { return .whatIs }
    return .unknown
}

/// Comandos para el Mac (myeyescantalk): correo, apps, leer pantalla, etc.
func isDesktopCommand(_ t: String) -> Bool {
    let s = t.lowercased()
    if s.contains("correo") || s.contains("mail") || s.contains("email") { return true }
    if s.range(of: #"\b(léeme|leeme|lee|léeme|leer)\b"#, options: .regularExpression) != nil,
       s.range(of: #"\b(correo|mail|mensajes|inbox)\b"#, options: .regularExpression) != nil {
        return true
    }
    if s.contains("platanus") && (s.contains("lee") || s.contains("léeme") || s.contains("leeme") || s.contains("correo")) {
        return true
    }
    if s.range(of: #"\b(abre|abrir|abreme)\b"#, options: .regularExpression) != nil,
       s.range(of: #"\b(correo|mail|safari|chrome|slack|notion|finder)\b"#, options: .regularExpression) != nil {
        return true
    }
    if s.contains("meta") || s.contains("mac") || s.contains("computadora"),
       s.range(of: #"\b(correo|mail|lee|léeme|leeme|abre)\b"#, options: .regularExpression) != nil {
        return true
    }
    return false
}

/// Intención reconocible del módulo super (lista, navegación, producto…) sin wake word.
func isSuperVoiceCommand(_ t: String) -> Bool {
    if isDesktopCommand(t) { return false }
    if intentOf(t) != .unknown { return true }
    let s = t.lowercased()
    if s.contains("lista") || s.contains("compra") || s.contains("carrito") { return true }
    if s.contains("pasillo") || s.contains("estante") || s.contains("super") { return true }
    if isLookingForProduct(s) { return true }
    if s.range(of: #"\b(ayuda|ayudar|ayúdame|ayudame)\b"#, options: .regularExpression) != nil { return true }
    return false
}

/// Wake word opcional + comandos super/desktop directos (paridad mobile-rn en super).
func resolveVoiceCommand(_ transcript: String) -> String? {
    if let afterWake = commandAfterWake(transcript) {
        return afterWake
    }
    let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if isDesktopCommand(trimmed) || isSuperVoiceCommand(trimmed) {
        return trimmed
    }
    return nil
}

func isWhereAmIQuestion(_ transcript: String) -> Bool {
    let s = transcript.lowercased()
    if s.range(of: #"d[oó]nde\s+(estoy|estamos|me\s+encuentro)"#, options: .regularExpression) != nil {
        return true
    }
    if s.contains("donde estamos") || s.contains("dónde estamos") { return true }
    if s.range(of: #"en\s+qu[eé]\s+lugar\s+(estoy|estamos)"#, options: .regularExpression) != nil {
        return true
    }
    if s.contains("mi ubicaci") || s.contains("en qué calle") || s.contains("en que calle") {
        return true
    }
    return false
}

/// Mic always-on: acepta cualquier frase no vacía (orquestador decide ruta).
func resolvePlatformCommand(_ transcript: String) -> String? {
    let t = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
}

func isClinicalQuestion(_ transcript: String) -> Bool {
    let s = transcript.lowercased()
    return s.contains("ansiedad") || s.contains("pánico") || s.contains("panico")
        || s.contains("nervios") || s.contains("estrés") || s.contains("estres")
        || s.contains("miedo") || s.contains("agobiad") || s.contains("no aguanto")
}

private let wakePrefixes = [
    "hola ayúdame",
    "hola ayudame",
    "hola puente",
    "oye puente",
    "oye",
    "puente",
    "hola",
]

/// Quita el disparador de voz ("hola ayúdame…") y devuelve el comando, o nil si no hubo disparador.
func commandAfterWake(_ transcript: String) -> String? {
    var s = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !s.isEmpty else { return nil }
    let lowered = s.lowercased()
    var matched = false
    for wake in wakePrefixes.sorted(by: { $0.count > $1.count }) {
        if lowered.hasPrefix(wake) {
            s = String(s.dropFirst(wake.count))
            matched = true
            break
        }
    }
    guard matched else { return nil }
    s = s.trimmingCharacters(in: CharacterSet.whitespaces.union(.punctuationCharacters))
    s = s.replacingOccurrences(
        of: #"^\s*(a|con|para|que|me)\s+"#,
        with: "",
        options: .regularExpression
    )
    return s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : s
}

func extractItem(_ transcript: String) -> String {
    var s = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    s = addRE.stringByReplacingMatches(in: s, range: NSRange(location: 0, length: (s as NSString).length), withTemplate: " ")
    s = s.replacingOccurrences(of: #"\b(a|en)\s+(la|mi)\s+(lista|compra)s?\b"#, with: " ", options: .regularExpression)
    s = s.replacingOccurrences(of: #"\b(a\s+la\s+lista|de\s+compras?|por\s+favor|porfa)\b"#, with: " ", options: .regularExpression)
    return s.trimmingCharacters(in: CharacterSet.whitespaces.union(.punctuationCharacters))
        .replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
}
