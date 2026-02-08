/**
 * Primary method: Use Places Autocomplete Service
 */
async function findWithPlacesAPI(query, userLocation) {
  if (!window.google?.maps?.places?.AutocompleteService) {
    return null;
  }

  const autocompleteService = new window.google.maps.places.AutocompleteService();
  const placesService = new window.google.maps.places.PlacesService(
    document.createElement('div')
  );

  return new Promise((resolve) => {
    autocompleteService.getPlacePredictions(
      {
        input: query + " College Station TX", // Add city to improve results
        location: new window.google.maps.LatLng(userLocation.lat, userLocation.lng),
        radius: 10000, // Reduce to 10km for more relevant results
        types: ['establishment'],
      },
      (predictions, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions || predictions.length === 0) {
          resolve(null);
          return;
        }

        // Prefer results that are actual businesses, not just city names
        const validPrediction = predictions.find(p => 
          !p.description.includes("College Station, TX, USA")
        ) || predictions[0];

        const placeId = validPrediction.place_id;
        placesService.getDetails(
          {
            placeId: placeId,
            fields: ['name', 'formatted_address', 'geometry', 'place_id'],
          },
          (place, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
              resolve({
                name: place.name,
                address: place.formatted_address,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                placeId: place.place_id,
              });
            } else {
              resolve(null);
            }
          }
        );
      }
    );
  });
}
/**
 * Fallback method: Use regular Geocoding API
 */
async function findWithGeocodingAPI(query, userLocation) {
  if (!window.google?.maps?.Geocoder) {
    return null;
  }

  const geocoder = new window.google.maps.Geocoder();

  return new Promise((resolve) => {
    geocoder.geocode(
      {
        address: `${query}, College Station, TX`,
        location: userLocation,
        region: 'us'
      },
      (results, status) => {
        if (status === "OK" && results[0]) {
          const place = results[0];
          resolve({
            name: query,
            address: place.formatted_address,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            placeId: place.place_id,
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Try Places API first, fallback to Geocoding
 */
export async function findNearbyPlace(query, userLocation) {
  console.log(`Searching for: ${query}`);

  // Try Places API first
  let result = await findWithPlacesAPI(query, userLocation);
  
  if (result) {
    console.log(`✓ Found with Places API: ${result.name} at ${result.address}`);
    return result;
  }

  // Fallback to Geocoding API
  console.log(`Places API failed, trying Geocoding API...`);
  result = await findWithGeocodingAPI(query, userLocation);
  
  if (result) {
    console.log(`✓ Found with Geocoding API: ${result.address}`);
    return result;
  }

  console.warn(`✗ Could not find: ${query}`);
  return null;
}

/**
 * Resolve multiple location queries
 */
export async function resolveLocations(tasks, userLocation) {
  if (!window.google?.maps?.Geocoder) {
    console.error("Google Maps not loaded");
    return [];
  }

  const resolvedTasks = [];

  // Resolve sequentially to avoid rate limits
  for (const task of tasks) {
    // If task already has valid coordinates, keep it
    if (task.lat && task.lng && !isNaN(task.lat) && !isNaN(task.lng)) {
      resolvedTasks.push(task);
      continue;
    }

    // Search for the place
    const place = await findNearbyPlace(task.location, userLocation);
    
    if (place) {
      resolvedTasks.push({
        ...task,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        location: place.name,
      });
    } else {
      console.warn(`Skipping task: ${task.title} - could not resolve location`);
    }
  }

  return resolvedTasks;
}