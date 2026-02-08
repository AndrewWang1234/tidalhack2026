import { useState, useRef, useEffect } from "react";
import Map from "./components/Map";
import { extractTasksFromText } from "./utils/gemini";
import { resolveLocations } from "./utils/places";

function createTimeAwareSchedule(tasks, route, userLocation, currentTime) {
  const now = new Date(currentTime);
  const schedule = [];
  let currentDateTime = new Date(now);

  tasks.forEach((task, i) => {
    const leg = route.legs[i];
    const travelMinutes = Math.ceil(leg.duration.value / 60);
    
    // Add travel time
    currentDateTime = new Date(currentDateTime.getTime() + travelMinutes * 60 * 1000);
    
    const startTime = new Date(currentDateTime);
    const endTime = new Date(startTime.getTime() + task.durationMinutes * 60 * 1000);
    
    const scheduleItem = {
      taskId: task.id,
      title: task.title,
      address: task.address,
      lat: task.lat,
      lng: task.lng,
      startTime,
      endTime,
      travelMinutes,
      isFixed: task.fixedTime,
    };
    
    if (task.fixedTime) {
      scheduleItem.deadline = new Date(task.mustArriveBy);
      scheduleItem.isLate = startTime > scheduleItem.deadline;
    }
    
    schedule.push(scheduleItem);
    currentDateTime = endTime;
  });

  return schedule;
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const messagesEndRef = useRef(null);

  const handleMapsReady = () => {
  console.log("✓ Maps ready for use");
  setMapsLoaded(true);
};

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 30.6280, lng: -96.3344 })
      );
    } else {
      setUserLocation({ lat: 30.6280, lng: -96.3344 });
    }

    // Wait for Google Maps Places library to load
    const checkMapsLoaded = setInterval(() => {
      if (window.google?.maps?.places?.AutocompleteService) {
        setMapsLoaded(true);
        clearInterval(checkMapsLoaded);
      }
    }, 100);

    return () => clearInterval(checkMapsLoaded);
  }, []);

const handleRouteCalculated = (orderedTasks, route) => {
  const newSchedule = createTimeAwareSchedule(orderedTasks, route, userLocation, new Date());
  setSchedule(newSchedule);

const scheduleText = newSchedule
  .map((s, i) => {
    let statusIcon = "";
    if (s.isFixed) {
      const minutesBeforeDeadline = (s.deadline - s.startTime) / 60000;
      if (s.isLate) {
        statusIcon = "🔴 LATE";
      } else if (minutesBeforeDeadline < 5) {
        statusIcon = "🟡 TIGHT";
      } else {
        statusIcon = "🟢 ON TIME";
      }
    }
    
    const fixedLabel = s.isFixed 
      ? `🔒 Must arrive by ${s.deadline.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` 
      : "";
    
    return `${i + 1}. ${statusIcon} ${s.title}\n   📍 ${s.address}\n   ⏰ Arrive: ${s.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n   🚗 ${s.travelMinutes} min travel${fixedLabel ? '\n   ' + fixedLabel : ''}`;
  })
  .join("\n\n");
  
  setMessages((prev) => [
    ...prev, 
    {
      sender: "bot",
      text:  `🗓️ Here's your optimized schedule:\n\n${scheduleText}`,
    },
  ]);
  setIsLoading(false);
};

  const handleSend = async () => {
    if (input.trim() === "" || !userLocation) return;

    if (!mapsLoaded) {
      setMessages((prev) => [
        ...prev, 
        { text: input, sender: "user" },
        { text: "⏳ Please wait for maps to load...", sender: "bot" }
      ]);
      return;
    }

    setMessages((prev) => [...prev, { text: input, sender: "user" }]);
    setIsLoading(true);

    try {
      // Step 1: Extract tasks from natural language
      const extractedTasks = await extractTasksFromText(
        input,
        userLocation, 
        new Date().toISOString(),
        allTasks
      );
      
      console.log("Extracted tasks:", extractedTasks);
      
      if (extractedTasks.length === 0) {
        setMessages((prev) => [...prev, { text: "❌ No tasks found in your message.", sender: "bot" }]);
        setIsLoading(false);
        return;
      }

      // Step 2: Resolve locations using Google Geocoding
      setMessages((prev) => [...prev, { text: "🔍 Finding locations...", sender: "bot" }]);
      
      const resolvedTasks = await resolveLocations(extractedTasks, userLocation);
      
      console.log("Resolved tasks:", resolvedTasks);

      if (resolvedTasks.length === 0) {
        setMessages((prev) => [
          ...prev, 
          { text: `❌ Could not find locations. Tried: ${extractedTasks.map(t => t.location).join(', ')}`, sender: "bot" }
        ]);
        setIsLoading(false);
        return;
      }

      // Show which locations were found
      const foundLocations = resolvedTasks.map(t => `✓ ${t.location}`).join('\n');
      setMessages((prev) => {
        // Remove the "Finding locations..." message
        const filtered = prev.filter(m => m.text !== "🔍 Finding locations...");
        return [...filtered, { text: `Found:\n${foundLocations}`, sender: "bot" }];
      });

      // Step 3: Update state - this will trigger Map to re-optimize entire route
      setAllTasks(resolvedTasks);
      setTasks(resolvedTasks);

      setInput("");
    } catch (err) {
      console.error("Error:", err);
      setMessages((prev) => [...prev, { text: `❌ Error: ${err.message}`, sender: "bot" }]);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !isLoading) handleSend();
  };

  const handleClearSchedule = () => {
    setTasks([]);
    setAllTasks([]);
    setSchedule([]);
    setMessages((prev) => [...prev, { text: "🗑️ Schedule cleared!", sender: "bot" }]);
  };

  return (
    
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      <div style={{ flex: "0 0 18%", minWidth: "220px", height: "100%", borderRight: "1px solid #ccc", display: "flex", flexDirection: "column", backgroundColor: "#f9f9f9" }}>
        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Smart Scheduler</h2>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#666" }}>
            AI-powered route planning with time constraints
          </p>
          {allTasks.length > 0 && (
            <button
              onClick={handleClearSchedule}
              style={{
                padding: "0.3rem 0.6rem",
                fontSize: "0.75rem",
                border: "none",
                backgroundColor: "#dc3545",
                color: "white",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {!mapsLoaded && (
            <div style={{ padding: "0.5rem", backgroundColor: "#fff3cd", borderRadius: "8px", fontSize: "0.9rem" }}>
              ⏳ Loading maps...
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                padding: "0.5rem",
                backgroundColor: msg.sender === "user" ? "#d1e7dd" : "#f8d7da",
                borderRadius: "8px",
                wordBreak: "break-word",
                alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                whiteSpace: "pre-wrap",
                fontSize: "0.9rem",
              }}
            >
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: "0.5rem 1rem 1rem 1rem", borderTop: "1px solid #ccc", display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "Processing..." : mapsLoaded ? "Add or modify tasks..." : "Loading..."}
            disabled={isLoading || !mapsLoaded}
            style={{ flex: 1, padding: "0.5rem", borderRadius: "5px", border: "1px solid #ccc" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !mapsLoaded}
            style={{ 
              padding: "0.5rem 1rem", 
              border: "none", 
              backgroundColor: isLoading || !mapsLoaded ? "#6c757d" : "#007bff", 
              color: "white", 
              borderRadius: "5px", 
              cursor: isLoading || !mapsLoaded ? "not-allowed" : "pointer" 
            }}
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, height: "100%" }}>
        <Map 
  tasks={tasks} 
  userLocation={userLocation} 
  onRouteCalculated={handleRouteCalculated}
  onMapsReady={handleMapsReady}
/>
      </div>
    </div>
  );
}

export default App;