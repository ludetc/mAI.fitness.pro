# Technology Stack

## Frontend
- **Framework:** [Expo](https://expo.dev/) (React Native)
- **Language:** TypeScript

## Backend
- **Platform:** [Cloudflare Workers](https://workers.cloudflare.com/)
- **Runtime:** Edge Runtime (V8)
- **Language:** TypeScript

## Database
- **Provider:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQL-based edge database)

## AI Model Strategy
To balance performance, cost, and fitness domain expertise, we utilize a tiered model approach:

- **Conversational Onboarding & Notifications:** `GPT-4o-mini`
    - *Rationale:* High speed and low cost for high-turn dialogues and creative, witty notification generation.
- **Workout Generation & Planning:** `Claude 3.5 Sonnet` or `GPT-4o`
    - *Rationale:* Higher reasoning capabilities for complex scheduling, safety considerations, and specialized fitness knowledge.
- **Equipment Photo Identification:** `GPT-4o` (Vision)
    - *Rationale:* Superior multi-modal capabilities for accurately identifying varied gym equipment from user-captured images.
- **Real-time Session Adjustments:** `GPT-4o-mini`
    - *Rationale:* Requires rapid latency for "in-the-moment" feedback during active workouts.

## Authentication
- **Provider:** Google One-Tap (Identity Services)
