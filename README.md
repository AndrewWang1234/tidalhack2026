# AI Day Planner 🗺️🕒

AI Day Planner is a conversational, location-aware daily planning tool that helps users turn real-world tasks into an optimized, visual schedule. Instead of planning your day as a rigid list, AI Day Planner plans it the way you actually live it: across locations, with time constraints, and flexibility built in.

---

## Inspiration

People plan their days in lists — but they execute them on maps.

When juggling classes, errands, work, and personal life, especially in a spontaneous college schedule, traditional planners quickly fall apart. AI Day Planner was inspired by the need for a more realistic way to plan a day: one that accounts for locations, travel time, and fixed and flexible commitments.

---

## What It Does

AI Day Planner allows users to describe their day naturally through a chatbot. The application then:

- Extracts tasks, locations, and time constraints from conversational input  
- Optimizes the order of tasks based on:
  - Location proximity
  - Fixed vs. flexible time constraints
  - The user’s current location
- Generates a structured schedule
- Visualizes the optimized route on a map

---

## How I Built It

### Frontend
- React
- JavaScript
- Google Maps API

### Backend / AI
- Gemini (natural language processing)
- featherless.ai (task optimization)

### Workflow

1. The user inputs tasks through a conversational chatbot interface.
2. The conversation is sent to **Gemini**, which parses the text into structured JSON objects representing each task’s:
   - Name
   - Location / address
   - Time constraints
3. These task objects are passed to **featherless.ai** to determine the most optimal order.
4. If the optimization API fails, a fallback algorithm organizes tasks based on fixed and flexible constraints.
5. The final schedule and route are rendered using the Google Maps API.

---

## Challenges

One of the biggest challenges was accurately extracting locations from conversational input. Tasks like “stop by the grocery store” often don’t include explicit addresses.

To improve accuracy, I:
- Included example JSON outputs in the Gemini prompt
- Added predefined location mappings (e.g. “grocery store” → HEB)
- Passed the user’s current location and time into the prompt for better context

---

## Accomplishments

- Built a functional MVP in **24 hours**
- Completed my **first hackathon** as a solo developer
- Successfully integrated multiple APIs and AI tools
- Delivered a usable end-to-end product under a tight deadline

---

## What I Learned

- Spending more time on planning and system design can save time later
- Large projects are easier to manage with a team, or with a reduced scope when solo
- Prompt engineering is critical when working with AI systems
- Gained hands-on experience with React, APIs, and AI-powered development

---

## What’s Next for AI Day Planner

Future improvements include:
- A more advanced task optimization algorithm
- Exporting schedules to calendars
- Supporting `.ics` file uploads
- Improved handling of ambiguous or flexible tasks
- UI/UX refinements and performance improvements

---

## Built With

- React
- JavaScript
- Gemini
- featherless.ai
- Google Maps API
