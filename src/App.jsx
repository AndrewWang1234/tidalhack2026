import { useState, useRef, useEffect } from "react";
import Map from "./components/Map";
import { planRouteFromText } from "./utils/gemini";

/**
 * Task object format (from Gemini Option A):
 * { id, title, address, lat, lng, order, estimatedTravelMinutes, durationMinutes, mustArriveBy, fixedTime }
 */

// ----------------- SCHEDULER FUNCTION -----------------
function createSchedule(tasks, currentLocation, currentTime) {
  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  const schedule = [];
  let time = new Date(currentTime);
  let location = {...currentLocation};

  for (const task of sortedTasks) {
    const travel = task.estimatedTravelMinutes || 0;
    time = new Date(time.getTime() + travel * 60 * 1000);

    let startTime = new Date(time);
    let endTime = new Date(startTime.getTime() + task.durationMinutes * 60 * 1000);

    if (task.fixedTime && task.mustArriveBy) {
      const mustArrive = new Date(task.mustArriveBy);
      if (endTime > mustArrive) {
        endTime = mustArrive;
        startTime = new Date(endTime.getTime() - task.durationMinutes * 60 * 1000);
      }
    }

    schedule.push({
      taskId: task.id,
      title: task.title,
      address: task.address,
      lat: task.lat,
      lng: task.lng,
      startTime,
      endTime,
    });

    // update for next task
    time = endTime;
    location = { lat: task.lat, lng: task.lng };
  }

  return schedule;
}
// ------------------------------------------------------


function App() {
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch user location on mount for map center and geocoding
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        () => {
          console.warn("Geolocation failed, using default Austin, TX");
          setUserLocation({ lat: 30.2672, lng: -97.7431 });
        }
      );
    } else {
      setUserLocation({ lat: 30.2672, lng: -97.7431 });
    }
  }, []);

  const handleSend = async () => {
    if (input.trim() === "") return;

    // 1️⃣ Add user message to chat
    setMessages((prev) => [...prev, { text: input, sender: "user" }]);

    try {
      // Get user location
      const location =
        userLocation ||
        (await new Promise((resolve) => {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                resolve({
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                }),
              () => resolve({ lat: 30.2672, lng: -97.7431 })
            );
          } else {
            resolve({ lat: 30.2672, lng: -97.7431 });
          }
        }));

      const currentTimeIso = new Date().toISOString();

      // Gemini returns planned tasks with lat/lng, order, and travel times
      const plannedTasks = await planRouteFromText(input, location, currentTimeIso);
      console.log("Planned tasks from Gemini:", plannedTasks);

      // Use our scheduler function to create a timeline
      const schedule = createSchedule(plannedTasks || [], location, currentTimeIso);
      console.log("Generated schedule:", schedule);

      // Show in chat
      setMessages((prev) => [
        ...prev,
        {
          text:
            "Generated schedule:\n" +
            JSON.stringify(schedule, null, 2) +
            "\n\n(Travel times are estimates.)",
          sender: "bot",
        },
      ]);

      // Update map
      setTasks(schedule);
      setInput("");
    } catch (err) {
      console.error("Error handling tasks:", err);
      setMessages((prev) => [
        ...prev,
        { text: "Error planning route: " + (err?.message || String(err)), sender: "bot" },
      ]);
    }
  };



  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh" }}>
      {/* Chat Box */}
      <div
        style={{
          flex: "0 0 18%",
          minWidth: "220px",
          height: "100%",
          borderRight: "1px solid #ccc",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f9f9f9",
        }}
      >
        {/* Header */}
        <div style={{ padding: "1rem 1rem 0.5rem 1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Chat</h2>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.5rem 1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
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
              }}
            >
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: "0.5rem 1rem 1rem 1rem",
            borderTop: "1px solid #ccc",
            display: "flex",
            gap: "0.5rem",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: "0.5rem",
              borderRadius: "5px",
              border: "1px solid #ccc",
              outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              backgroundColor: "#007bff",
              color: "white",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, height: "100%" }}>
        <Map tasks={tasks} userLocation={userLocation} />
      </div>
    </div>
  );
}

export default App;
