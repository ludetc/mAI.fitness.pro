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

## Deployment & Configuration
The system is designed for multi-deployment portability, allowing collaborators to deploy their own instances with custom AI credit configurations:

- **Configurable Model Providers:** All AI interactions must be abstracted via a provider interface. 
- **Environment Variables:** Model selection (e.g., swapping `GPT-4` for `Claude 3 Opus`) and API keys are managed through Cloudflare Worker environment variables and secrets.
- **Portability:** The codebase supports varying "AI credit" setups, ensuring that one deployment's costs or model preferences do not affect another.

## Authentication
- **Provider:** Google One-Tap (Identity Services)
