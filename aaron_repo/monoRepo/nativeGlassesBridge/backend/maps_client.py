import httpx
import logging
from typing import Dict, Any, Optional
import config

logger = logging.getLogger(__name__)

# Mapa simple para traducir comandos del usuario en lenguaje natural a tipos oficiales de Google Places
PLACE_TYPE_MAPPING = {
    "super": ["supermarket", "grocery_store"],
    "supermercado": ["supermarket", "grocery_store"],
    "tienda": ["convenience_store", "store"],
    "farmacia": ["pharmacy", "drugstore"],
    "restaurante": ["restaurant", "food"],
    "cafeteria": ["cafe", "coffee_shop"],
    "cafe": ["cafe", "coffee_shop"],
    "banco": ["bank", "atm"]
}

async def find_closest_place(lat: float, lng: float, place_query: str) -> Optional[Dict[str, Any]]:
    """
    Busca el lugar más cercano compatible con el query del usuario usando Google Places API (New).
    """
    if not config.GOOGLE_MAPS_API_KEY:
        logger.warning("Falta GOOGLE_MAPS_API_KEY en la configuración. Retornando mock de lugar.")
        return {
            "name": f"Supermercado Mock ({place_query})",
            "lat": lat + 0.003,
            "lng": lng + 0.003,
            "address": "Calle Falsa 123, Ciudad de México"
        }

    # Resolver tipo de lugar
    query_clean = place_query.lower().strip()
    included_types = PLACE_TYPE_MAPPING.get(query_clean, ["store"])

    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.location,places.formattedAddress"
    }
    
    payload = {
        "includedTypes": included_types,
        "maxResultCount": 1,
        "locationRestriction": {
          "circle": {
            "center": {
              "latitude": lat,
              "longitude": lng
            },
            "radius": 2000.0  # 2 km
          }
        }
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, headers=headers, timeout=10.0)
            if response.status_code != 200:
                logger.error(f"Error en Google Places API: {response.status_code} - {response.text}")
                return None
                
            data = response.json()
            places = data.get("places", [])
            if not places:
                logger.info(f"No se encontraron lugares de tipo {included_types} cerca de {lat}, {lng}")
                return None
                
            closest = places[0]
            display_name = closest.get("displayName", {}).get("text", "Establecimiento cercano")
            location = closest.get("location", {})
            address = closest.get("formattedAddress", "Dirección no disponible")
            
            return {
                "name": display_name,
                "lat": location.get("latitude"),
                "lng": location.get("longitude"),
                "address": address
            }
    except Exception as e:
        logger.error(f"Excepción al llamar a Google Places API: {e}")
        return None

async def calculate_walking_route(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float) -> Optional[Dict[str, Any]]:
    """
    Calcula la ruta a pie desde el origen hasta el destino usando Google Directions API.
    """
    if not config.GOOGLE_MAPS_API_KEY:
        logger.warning("Falta GOOGLE_MAPS_API_KEY en la configuración. Retornando mock de ruta.")
        return {
            "distance_m": 350,
            "duration_s": 240,
            "steps": [
                {"instruction": "Camina de frente por 100 metros", "distance_m": 100},
                {"instruction": "Gira a la derecha en la esquina", "distance_m": 50},
                {"instruction": "Cruza la calle en el paso de peatones", "distance_m": 20},
                {"instruction": "El destino estará a tu izquierda", "distance_m": 180}
            ]
        }

    url = "https://maps.googleapis.com/maps/api/directions/json"
    params = {
        "origin": f"{origin_lat},{origin_lng}",
        "destination": f"{dest_lat},{dest_lng}",
        "mode": "walking",
        "key": config.GOOGLE_MAPS_API_KEY
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            if response.status_code != 200:
                logger.error(f"Error en Google Directions API: {response.status_code} - {response.text}")
                return None
                
            data = response.json()
            routes = data.get("routes", [])
            if not routes:
                logger.info("No se encontró ninguna ruta peatonal.")
                return None
                
            leg = routes[0].get("legs", [])[0]
            distance_m = leg.get("distance", {}).get("value", 0)
            duration_s = leg.get("duration", {}).get("value", 0)
            
            steps = []
            for s in leg.get("steps", []):
                # Limpiar tags HTML de la instrucción (ej: <b>Gira a la izquierda</b>)
                raw_instruction = s.get("html_instructions", "")
                import re
                clean_instruction = re.sub('<[^<]+?>', '', raw_instruction)
                
                steps.append({
                    "instruction": clean_instruction,
                    "distance_m": s.get("distance", {}).get("value", 0),
                    "duration_s": s.get("duration", {}).get("value", 0),
                    "start_location": s.get("start_location", {}),
                    "end_location": s.get("end_location", {})
                })
                
            return {
                "distance_m": distance_m,
                "duration_s": duration_s,
                "steps": steps
            }
    except Exception as e:
        logger.error(f"Excepción al llamar a Google Directions API: {e}")
        return None
