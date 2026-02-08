const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Places API (New) Text Search - fallback for business names when Geocoding returns ZERO_RESULTS.
 * Requires "Places API (New)" enabled in Google Cloud Console.
 */
export async function placesSearch(placeName, userCity, userLocation, apiKey) {
  if (!apiKey) return null;
  const textQuery = `${placeName}, ${userCity}`;
  const body = {
    textQuery,
    locationBias: {
      circle: {
        center: { latitude: userLocation.lat, longitude: userLocation.lng },
        radius: 50000,
      },
    },
    rankPreference: "DISTANCE",
  };
  const res = await fetch(PLACES_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.location",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn("[Places] API error:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const place = data.places?.[0];
  const loc = place?.location;
  if (loc?.latitude != null && loc?.longitude != null) {
    return { lat: loc.latitude, lng: loc.longitude };
  }
  return null;
}

/**
 * Reverse geocode lat/lng to get city and state (e.g. "College Station, TX").
 * Used to disambiguate addresses based on user location.
 */
export async function reverseGeocode(lat, lng, apiKey) {
  if (!apiKey) return null;
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key: apiKey,
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`);
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.[0]) return null;

  const comps = data.results[0].address_components || [];
  let city = "";
  let state = "";
  for (const c of comps) {
    if (c.types.includes("locality")) city = c.long_name;
    if (c.types.includes("administrative_area_level_1")) state = c.short_name;
  }
  if (city && state) return `${city}, ${state}`;
  if (state) return state;
  return null;
}

/**
 * Geocode an address to lat/lng using Google Geocoding API.
 * @param {string} address - Address or place name to geocode
 * @param {object} options - { apiKey, userLocation? }
 * @returns {Promise<{ lat: number, lng: number } | null>} - Coordinates or null if failed
 */
export async function geocodeAddress(address, { apiKey, userLocation = null }) {
  if (!address?.trim()) return null;
  if (!apiKey) throw new Error("VITE_GOOGLE_MAPS_API_KEY is not set in .env");

  const params = new URLSearchParams({
    address: address.trim(),
    key: apiKey,
  });

  // Use bounds for location biasing (location+radius are NOT valid Geocoding API params)
  if (userLocation) {
    const offset = 0.05; // ~5km
    const sw = `${userLocation.lat - offset},${userLocation.lng - offset}`;
    const ne = `${userLocation.lat + offset},${userLocation.lng + offset}`;
    params.set("bounds", `${sw}|${ne}`);
    params.set("region", "us"); // Bias toward US when we have location
  }

  const res = await fetch(`${GEOCODE_URL}?${params}`);
  const data = await res.json();

  // Debug: log response status (remove after fixing)
  console.log(`[Geocode] "${address}" → status: ${data.status}`, data.status !== "OK" ? data : "");

  if (data.status !== "OK") {
    const msg = data.error_message || data.status;
    if (data.status === "REQUEST_DENIED" || data.status === "OVER_DAILY_LIMIT") {
      throw new Error(
        `Geocoding API error: ${msg}. Enable "Geocoding API" in Google Cloud Console and ensure billing is enabled.`
      );
    }
    if (data.status === "ZERO_RESULTS") {
      console.warn(`Geocoding: no results for "${address}"`);
      return null;
    }
    console.warn(`Geocoding: ${data.status} for "${address}"`, msg);
    return null;
  }

  const first = data.results?.[0];
  if (!first?.geometry?.location) {
    console.warn("[Geocode] OK but no geometry.location in response:", first);
    return null;
  }

  const loc = first.geometry.location;
  const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
  const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
  if (lat == null || lng == null) {
    console.warn("[Geocode] Invalid lat/lng in response:", loc);
    return null;
  }
  return { lat, lng };
}
