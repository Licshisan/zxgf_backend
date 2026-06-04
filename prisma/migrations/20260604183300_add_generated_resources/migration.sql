CREATE TYPE "GeneratedResourceType" AS ENUM ('LEARNING_DOCUMENT');

CREATE TYPE "GeneratedResourceStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "generated_resources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "type" "GeneratedResourceType" NOT NULL DEFAULT 'LEARNING_DOCUMENT',
  "status" "GeneratedResourceStatus" NOT NULL DEFAULT 'PENDING',
  "prompt" TEXT,
  "input" JSONB,
  "content" TEXT,
  "file_path" TEXT,
  "file_name" VARCHAR(255),
  "metadata" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "generated_resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generated_resources_user_id_idx" ON "generated_resources"("user_id");
CREATE INDEX "generated_resources_type_idx" ON "generated_resources"("type");
CREATE INDEX "generated_resources_status_idx" ON "generated_resources"("status");
CREATE INDEX "generated_resources_created_at_idx" ON "generated_resources"("created_at");

ALTER TABLE "generated_resources"
  ADD CONSTRAINT "generated_resources_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
