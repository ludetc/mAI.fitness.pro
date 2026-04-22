# Project Requirements: mAI.fitness.pro

## 1. Overview
mAI.fitness.pro is an interactive, AI-first fitness companion that builds deep personal profiles to deliver hyper-tailored workout experiences. The app focuses on conversational interaction and real-time session adjustment.

## 2. User Onboarding & Authentication
- **Authentication:** Users must sign in via Google One-Tap to access the application.
- **AI Consultation:** A back-and-forth introductory discussion to establish the user's foundation.
    - **Concise AI:** The AI must remain brief and efficient in its responses.
    - **Input Methods:** Support for both standard typing and microphone-based dictation.
- **Discovery Profile:** The AI gathers:
    - **Demographics:** Age and basic physical profile.
    - **Primary Goals:** Specific objectives (e.g., weight loss, boxing preparation, ski competition training).
    - **Availability:** Time commitment per day/week.
    - **Current Activity:** Existing exercise routines or physical labor.
    - **Health & Safety:** Health issues, injuries, or physical concerns.
    - **Holistic Profile:** "Unrelated" personal data including occupation, hobbies, and interesting personal facts to build a psychological profile for better motivation.

## 3. Planning & Equipment
- **Environment Context:** The AI identifies where the user works out (Home, Commercial Gym, Outdoor, etc.).
- **Equipment Audit:** Users list available equipment or take photos of their equipment for AI-driven identification; the AI adapts the plan based on these constraints.
- **Scheduling:** Ability to plan and commit to workout sessions within the app.

## 4. Real-time Workout Execution
- **Step-by-Step Guidance:** The AI stays "active" throughout the session.
- **Metric Tracking:** Real-time recording of sets, reps, and weight lifted for every exercise.
- **Dynamic Tailoring:** Every session is adjusted based on the performance and feedback of the previous one.
- **Exercise Previews:** 
    - Visual guides (photos/illustrations) for each movement.
    - Concise instructional text.
- **Alternative Suggestions:** AI provides "similar exercises" on the fly if:
    - Equipment is missing or broken.
    - The gym is too crowded (machines are busy).
    - The user lacks motivation for a specific movement.

## 5. Engagement & Motivation
- **Smart Notifications:** Daily notifications that are witty, clever, and highly personalized.
- **Bespoke Motivation:** Using the "Holistic Profile" (hobbies/work) to craft motivational messages that resonate specifically with the user's personality.

## 6. Design & Visual Identity
- **Senior-Level UI:** The interface must be highly polished, with fluid transitions, consistent spacing, and interactive feedback that feels premium.
- **Gritty Aesthetic:** The visual style should lean into a "gritty," high-intensity workout vibe—utilizing high-contrast elements, bold typography, and a raw, performance-focused color palette (e.g., dark mode by default, industrial textures).
- **Engaging & Fun:** Despite the grit, the experience should remain engaging through micro-interactions, "gamified" progress markers, and the witty personality of the AI.

## 7. Technical Constraints
- **Framework:** Expo (React Native).
- **Backend:** Cloudflare Workers with D1 Database.
- **Voice:** Integration with device speech-to-text capabilities.
