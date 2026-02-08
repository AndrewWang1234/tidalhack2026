import { useEffect, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
if (apiKey) setOptions({ key: apiKey });

export default function Map({ tasks, userLocation }) {
  const mapRef = useRef(null);

  useEffect(() => {
    if (!apiKey) return;

    importLibrary("maps")
      .then(() => {
        if (!mapRef.current) return;

        const defaultLocation = { lat: 30.2672, lng: -97.7431 }; // fallback Austin, TX

        const mapCenter = userLocation || defaultLocation;

        const map = new window.google.maps.Map(mapRef.current, {
          center: mapCenter,
          zoom: 13,
        });

        // Marker for user
        if (userLocation) {
          new window.google.maps.Marker({
            position: userLocation,
            map,
            title: "You are here",
            icon: { url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" },
          });
        }

        // Markers for tasks
        tasks.forEach((task) => {
          if (task.lat && task.lng) {
            new window.google.maps.Marker({
              position: { lat: task.lat, lng: task.lng },
              map,
              title: task.title,
            });
          }
        });
      })
      .catch((err) => {
        console.error("Google Maps load error:", err);
      });
  }, [tasks, userLocation]);

  

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
