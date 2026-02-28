# Academy Backend

TypeScript Express backend for the Academy LMS, using Drizzle ORM and PostgreSQL.

## Prerequisites

- Node.js (v18+)
- PostgreSQL database (Railway)

## Setup

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment variables in a `.env` file (see `.env.example`).
4.  Build the project:
    ```bash
    npm run build:backend
    ```

## Scripts

- `npm run dev`: Start development server with nodemon.
- `npm run build:backend`: Compile TypeScript to JavaScript.
- `npm run start`: Run the compiled production build.

## Deployment

Configured for deployment on Railway via `railway.toml`.
