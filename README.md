# nest-project

NestJS backend project with Swagger, environment config, request validation, Helmet, and Prisma PostgreSQL integration.

## Setup

```bash
npm install
```

Create `.env` from `.env.example`, then set `DATABASE_URL`.

## Scripts

```bash
npm run start          # Start once
npm run start:dev      # Start in watch mode
npm run start:debug    # Start with debugger
npm run start:prod     # Run compiled dist/main
npm run build          # Build project
npm run format         # Format source files, excluding generated Prisma files
npm run lint           # Lint and fix source files, excluding generated Prisma files
npm run prisma:generate # Generate Prisma Client
npm run prisma:migrate  # Create/apply development migration
npm run prisma:push    # Sync schema directly to database
```

Swagger docs are available at `/docs` after startup.

## Database Sync API

```bash
POST /database/sync
```

Runs `npx prisma db push` from the server process. Use for local development only.
