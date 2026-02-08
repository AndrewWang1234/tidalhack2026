import { useState, useRef, useEffect } from "react";
import Map from "./components/Map";
import { extractTasksFromText } from "./utils/gemini";
import { resolveLocations } from "./utils/places";

function createTimeAwareSchedule(tasks, route) {
  const BUFFER_MINUTES = 5; // arrive 5 mins early
  const schedule = [];

  tasks.forEach((task, i) => {
    const leg = route.legs[i];
    const travelMinutes = Math.ceil(leg.duration.value / 60);

    let departTime = null;
    let arriveTime = null;

    if (task.fixedTime && task.mustArriveBy) {
      const mustArrive = new Date(task.mustArriveBy);
      arriveTime = new Date(mustArrive.getTime() - BUFFER_MINUTES * 60 * 1000);
      departTime = new Date(arriveTime.getTime() - travelMinutes * 60 * 1000);
    }

    schedule.push({
      taskId: task.id,
      title: task.title,
      address: task.address,
      lat: task.lat,
      lng: task.lng,
      departTime,
      arriveTime,
      durationMinutes: task.durationMinutes || 30,
      travelMinutes,
      isFixed: task.fixedTime,
      deadline: task.fixedTime ? new Date(task.mustArriveBy) : null,
    });
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

    const checkMapsLoaded = setInterval(() => {
      if (window.google?.maps?.places?.AutocompleteService) {
        setMapsLoaded(true);
        clearInterval(checkMapsLoaded);
      }
    }, 100);

    return () => clearInterval(checkMapsLoaded);
  }, []);

  const handleMapsReady = () => setMapsLoaded(true);

  const handleRouteCalculated = (orderedTasks, route) => {
    const newSchedule = createTimeAwareSchedule(orderedTasks, route);
    setSchedule(newSchedule);

    const scheduleText = newSchedule
      .map((s, i) => {
        const statusIcon = s.isFixed
          ? (s.arriveTime && s.deadline
              ? (s.arriveTime > s.deadline ? "🔴 LATE" : (s.deadline - s.arriveTime) / 60000 < 5 ? "🟡 TIGHT" : "🟢 ON TIME")
              : "")
          : "";

        const fixedLabel = s.isFixed && s.deadline
          ? `🔒 Must arrive by ${s.deadline.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : "";

        const departLabel = s.departTime
          ? `🚗 Depart: ${s.departTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} (${s.travelMinutes} min travel)`
          : "🚗 Depart whenever";

        const arriveLabel = s.arriveTime
          ? `📍 Arrive: ${s.arriveTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
          : "";

        return `${i + 1}. ${statusIcon} ${s.title}
   📍 ${s.address}
   ${departLabel}
   ${arriveLabel}${fixedLabel ? '\n   ' + fixedLabel : ''}`;
      })
      .join("\n\n");

    setMessages((prev) => [
      ...prev,
      { sender: "bot", text: `🗓️ Here's your optimized schedule:\n\n${scheduleText}` },
    ]);

    setIsLoading(false);
  };

  const handleSend = async () => {
    if (input.trim() === "" || !userLocation) return;

    if (!mapsLoaded) {
      setMessages((prev) => [
        ...prev,
        { text: input, sender: "user" },
        { text: "⏳ Please wait for maps to load...", sender: "bot" },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { text: input, sender: "user" }]);
    setIsLoading(true);

    try {
      const extractedTasks = await extractTasksFromText(input, userLocation, new Date().toISOString(), allTasks);
      if (!extractedTasks.length) {
        setMessages((prev) => [...prev, { text: "❌ No tasks found in your message.", sender: "bot" }]);
        setIsLoading(false);
        return;
      }

      setMessages((prev) => [...prev, { text: "🔍 Finding locations...", sender: "bot" }]);
      const resolvedTasks = await resolveLocations(extractedTasks, userLocation);
      if (!resolvedTasks.length) {
        setMessages((prev) => [
          ...prev,
          { text: `❌ Could not find locations. Tried: ${extractedTasks.map(t => t.location).join(', ')}`, sender: "bot" },
        ]);
        setIsLoading(false);
        return;
      }

      const foundLocations = resolvedTasks.map(t => `✓ ${t.location}`).join('\n');
      setMessages((prev) => {
        const filtered = prev.filter(m => m.text !== "🔍 Finding locations...");
        return [...filtered, { text: `Found:\n${foundLocations}`, sender: "bot" }];
      });

      setAllTasks(resolvedTasks);
      setTasks(resolvedTasks);
      setInput("");
    } catch (err) {
      console.error(err);
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

  // **Cool modern styles**
  const sidebarStyle = {
    flex: "0 0 20%",
    minWidth: "280px",
    display: "flex",
    flexDirection: "column",
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(10px)",
    borderRight: "1px solid rgba(0,0,0,0.1)",
    boxShadow: "2px 0 8px rgba(0,0,0,0.05)",
  };

  const headerStyle = {
    padding: "1rem",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
  };

  const chatContainerStyle = {
    flex: 1,
    overflowY: "auto",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  };

  const inputContainerStyle = {
    padding: "1rem",
    borderTop: "1px solid rgba(0,0,0,0.05)",
    display: "flex",
    gap: "0.5rem",
  };

  const inputStyle = {
    flex: 1,
    padding: "0.6rem 1rem",
    borderRadius: "999px",
    border: "1px solid #ccc",
    outline: "none",
    fontSize: "0.95rem",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.05)",
  };

  const buttonStyle = (enabled = true) => ({
    padding: "0.6rem 1.2rem",
    borderRadius: "999px",
    border: "none",
    background: enabled ? "#007bff" : "#6c757d",
    color: "white",
    cursor: enabled ? "pointer" : "not-allowed",
    fontWeight: 500,
    fontSize: "0.95rem",
    boxShadow: enabled ? "0 4px 12px rgba(0,123,255,0.3)" : "none",
    transition: "all 0.2s ease",
  });

  const messageStyle = (sender) => ({
    padding: "0.6rem 1rem",
    borderRadius: "16px",
    maxWidth: "75%",
    alignSelf: sender === "user" ? "flex-end" : "flex-start",
    background: sender === "user" ? "linear-gradient(135deg, #a8edea, #fed6e3)" : "linear-gradient(135deg, #fbc2eb, #a6c1ee)",
    color: "#333",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    fontSize: "0.92rem",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
  });

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Sidebar Chat */}
      <div style={sidebarStyle}>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 600 }}>Smart Scheduler</h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#555" }}>AI-powered route planning</p>
          {allTasks.length > 0 && (
            <button onClick={handleClearSchedule} style={{ ...buttonStyle(true), marginTop: "0.5rem", backgroundColor: "#dc3545" }}>
              Clear Schedule
            </button>
          )}
        </div>

        <div style={chatContainerStyle}>
          {!mapsLoaded && <div style={{ padding: "0.7rem", backgroundColor: "#fff3cd", borderRadius: "12px", fontSize: "0.9rem", textAlign: "center" }}>⏳ Loading maps...</div>}
          {messages.map((msg, idx) => (
            <div key={idx} style={messageStyle(msg.sender)}>
              {msg.text}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={inputContainerStyle}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? "Processing..." : mapsLoaded ? "Add or modify tasks..." : "Loading..."}
            disabled={isLoading || !mapsLoaded}
            style={inputStyle}
          />
          <button onClick={handleSend} disabled={isLoading || !mapsLoaded} style={buttonStyle(!(isLoading || !mapsLoaded))}>
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </div>

      {/* Map Area */}
      <div style={{ flex: 1, height: "100%" }}>
        <Map tasks={tasks} userLocation={userLocation} onRouteCalculated={handleRouteCalculated} onMapsReady={handleMapsReady} />
      </div>
    </div>
  );
}

export default App;
