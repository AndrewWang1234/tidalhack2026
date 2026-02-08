import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
if (apiKey) {
  setOptions({ key: apiKey });
}

export default function Map({ tasks = [], userLocation, onRouteCalculated, onMapsReady }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const [librariesLoaded, setLibrariesLoaded] = useState(false);

  // Initialize map and load libraries
  useEffect(() => {
    if (!apiKey) {
      console.error("Google Maps API key missing");
      return;
    }

    if (!mapRef.current || mapInstanceRef.current) return;

    // Load maps, places, and geometry libraries
    Promise.all([
      importLibrary("maps", { libraries: ["geometry", "places"] }),
      importLibrary("places")
    ]).then(() => {
      if (!mapRef.current) return;

      console.log("✓ Google Maps libraries loaded");

      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: userLocation || { lat: 30.6280, lng: -96.3344 },
        zoom: 13,
      });

      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: true,
      });

      setLibrariesLoaded(true);
      
      if (onMapsReady) onMapsReady();
    }).catch(err => {
      console.error("Failed to load Google Maps:", err);
    });
  }, []);

  // Update user marker
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocation) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(userLocation);
    } else {
      userMarkerRef.current = new window.google.maps.Marker({
        position: userLocation,
        map: mapInstanceRef.current,
        title: "Your Location",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeWeight: 3,
          strokeColor: "#fff",
        },
        zIndex: 1000,
      });
    }

    if (tasks.length === 0) {
      mapInstanceRef.current.setCenter(userLocation);
      mapInstanceRef.current.setZoom(13);
    }
  }, [userLocation, tasks.length]);

  // Draw route when tasks change
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocation || tasks.length === 0 || !librariesLoaded) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setDirections({ routes: [] });
    }

    calculateOptimalRoute();
  }, [tasks, userLocation, librariesLoaded]);

  // --- Helper: Distance between two points ---
  const distanceBetween = (lat1, lng1, lat2, lng2) => {
    const p1 = new window.google.maps.LatLng(lat1, lng1);
    const p2 = new window.google.maps.LatLng(lat2, lng2);
    return window.google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
  };

  // --- Main route calculation ---
  const calculateOptimalRoute = async () => {
    try {
      const fixedTasks = tasks.filter(t => t.fixedTime)
                              .sort((a, b) => new Date(a.mustArriveBy) - new Date(b.mustArriveBy));
      const flexibleTasks = tasks.filter(t => !t.fixedTime);

      console.log("Fixed tasks:", fixedTasks.map(t => t.title));
      console.log("Flexible tasks:", flexibleTasks.map(t => t.title));

      let orderedFlexible = flexibleTasks;

      // Sort flexible tasks by proximity to last fixed task (or user location if no fixed tasks)
      if (flexibleTasks.length > 0) {
        const referencePoint = fixedTasks.length > 0 
          ? fixedTasks[fixedTasks.length - 1] 
          : { lat: userLocation.lat, lng: userLocation.lng };

        orderedFlexible = [...flexibleTasks].sort(
          (a, b) =>
            distanceBetween(referencePoint.lat, referencePoint.lng, a.lat, a.lng) -
            distanceBetween(referencePoint.lat, referencePoint.lng, b.lat, b.lng)
        );
      }

      const finalOrder = [...fixedTasks, ...orderedFlexible];

      console.log("Final task order:", finalOrder.map(t => t.title));
      drawFinalRoute(finalOrder);
    } catch (err) {
      console.error("Route calculation error:", err);
    }
  };

  // --- Draw the route on the map ---
  const drawFinalRoute = (orderedTasks) => {
    if (orderedTasks.length === 0) return;

    const directionsService = new window.google.maps.DirectionsService();

    const waypoints = orderedTasks.slice(0, -1).map(t => ({
      location: { lat: t.lat, lng: t.lng },
      stopover: true,
    }));

    const destination = {
      lat: orderedTasks[orderedTasks.length - 1].lat,
      lng: orderedTasks[orderedTasks.length - 1].lng,
    };

    directionsService.route(
      {
        origin: userLocation,
        destination,
        waypoints,
        travelMode: window.google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === "OK") {
          directionsRendererRef.current.setDirections(result);
          drawMarkers(orderedTasks);
          if (onRouteCalculated) onRouteCalculated(orderedTasks, result.routes[0]);
        } else {
          console.error("Final route failed:", status);
        }
      }
    );
  };

  // --- Draw numbered markers ---
  const drawMarkers = (orderedTasks) => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    orderedTasks.forEach((task, i) => {
      const marker = new window.google.maps.Marker({
        position: { lat: task.lat, lng: task.lng },
        map: mapInstanceRef.current,
        title: `${i + 1}. ${task.title}${task.fixedTime ? ` (by ${new Date(task.mustArriveBy).toLocaleTimeString()})` : ''}`,
        label: {
          text: `${i + 1}`,
          color: "white",
          fontWeight: "bold",
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: task.fixedTime ? "#EA4335" : "#FBBC04",
          fillOpacity: 1,
          strokeWeight: 2,
          strokeColor: "#fff",
        },
      });
      markersRef.current.push(marker);
    });
  };

  return <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: "400px" }} />;
}
