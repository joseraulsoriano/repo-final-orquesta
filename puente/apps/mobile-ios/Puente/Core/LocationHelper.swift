import CoreLocation

/// Geocodificación inversa cacheada (~90 s) para respuestas «dónde estoy» sin red al Worker.
enum LocationCache {
    private static var last: (text: String, at: Date)?
    private static let maxAge: TimeInterval = 90

    static func prefetch(lat: Double, lng: Double) {
        Task {
            if let text = await LocationHelper.whereAmI(lat: lat, lng: lng) {
                last = (text, Date())
            }
        }
    }

    static func cached() -> String? {
        guard let entry = last, Date().timeIntervalSince(entry.at) < maxAge else { return nil }
        return entry.text
    }

    static func store(_ text: String) {
        last = (text, Date())
    }
}

enum LocationHelper {
    static func whereAmI(lat: Double, lng: Double) async -> String? {
        let loc = CLLocation(latitude: lat, longitude: lng)
        let geocoder = CLGeocoder()
        do {
            let places = try await geocoder.reverseGeocodeLocation(loc)
            guard let a = places.first else { return nil }
            var parts: [String] = []
            let calle = a.thoroughfare ?? a.name
            if let calle {
                if let n = a.subThoroughfare { parts.append("\(calle) \(n)") }
                else { parts.append(calle) }
            }
            if let col = a.subLocality ?? a.subAdministrativeArea {
                parts.append("colonia \(col)")
            }
            if parts.isEmpty, let city = a.locality { parts.append(city) }
            return parts.isEmpty ? nil : parts.joined(separator: ", ")
        } catch {
            return nil
        }
    }
}
