import { useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// Set Google Maps API key once at module load
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
if (apiKey) {
  setOptions({ key: apiKey });
}

export default function Map({ tasks = [], userLocation }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null); // store map instance
  const markersRef = useRef([]); // store task markers
  const userMarkerRef = useRef(null); // store user location marker

  useEffect(() => {
    if (!apiKey) {
      console.error(
        "Google Maps API key is missing. Add VITE_GOOGLE_MAPS_API_KEY to .env"
      );
      return;
    }

    if (!mapRef.current) return;

    importLibrary("maps")
      .then(() => {
        if (!mapRef.current) return;

        // Initialize map once
        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
            center: { lat: 40.7128, lng: -74.006 }, // default
            zoom: 12,
          });

          // Center immediately if userLocation exists
          if (userLocation) {
            mapInstanceRef.current.setCenter(userLocation);
            mapInstanceRef.current.setZoom(14);

            // Add current location marker
            userMarkerRef.current = new window.google.maps.Marker({
              position: userLocation,
              map: mapInstanceRef.current,
              title: "You are here",
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#007bff",
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#fff",
              },
            });
          }
        }
      })
      .catch((err) => {
        console.error("Google Maps load error:", err);
      });
  }, []);

  // Update user location marker when userLocation changes
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocation) return;

    // If marker exists, move it; otherwise create it
    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(userLocation);
    } else {
      userMarkerRef.current = new window.google.maps.Marker({
        position: userLocation,
        map: mapInstanceRef.current,
        title: "You are here",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#007bff",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#fff",
        },
      });
    }

    // Optional: recenter map on user location
    mapInstanceRef.current.setCenter(userLocation);
    mapInstanceRef.current.setZoom(14);
  }, [userLocation]);

  // Update task markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Remove old task markers
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    if (tasks.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();

    tasks.forEach((task) => {
      if (task.lat != null && task.lng != null) {
        const marker = new window.google.maps.Marker({
          position: { lat: task.lat, lng: task.lng },
          map: mapInstanceRef.current,
          title: task.title,
        });
        markersRef.current.push(marker);
        bounds.extend(marker.getPosition());
      }
    });

    // Optionally extend bounds to include user location
    if (userLocation) bounds.extend(userLocation);

    // Fit map to show all markers
    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds);
    }
  }, [tasks, userLocation]);

  return (
    <div
      ref={mapRef}
      style={{ width: "100%", height: "100%", minHeight: "400px" }}
    />
  );
}
