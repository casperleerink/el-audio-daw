import { execSync } from "node:child_process";

const CONTAINER_NAME = "el-audio-daw-postgres";
const POSTGRES_PORT = 5432;
const POSTGRES_USER = "postgres";
const POSTGRES_PASSWORD = "postgres";
const POSTGRES_DB = "el_audio_daw";

function isContainerRunning(): boolean {
  try {
    const result = execSync(`docker ps --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`, {
      encoding: "utf-8",
    });
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

function containerExists(): boolean {
  try {
    const result = execSync(
      `docker ps -a --filter "name=${CONTAINER_NAME}" --format "{{.Names}}"`,
      { encoding: "utf-8" },
    );
    return result.trim() === CONTAINER_NAME;
  } catch {
    return false;
  }
}

function startContainer(): void {
  if (isContainerRunning()) {
    console.log(`✓ Postgres container already running on port ${POSTGRES_PORT}`);
    return;
  }

  if (containerExists()) {
    console.log("Starting existing Postgres container...");
    execSync(`docker start ${CONTAINER_NAME}`, { stdio: "inherit" });
  } else {
    console.log("Creating new Postgres container...");
    execSync(
      `docker run -d \
        --name ${CONTAINER_NAME} \
        -e POSTGRES_USER=${POSTGRES_USER} \
        -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD} \
        -e POSTGRES_DB=${POSTGRES_DB} \
        -p ${POSTGRES_PORT}:5432 \
        postgres:17-alpine`,
      { stdio: "inherit" },
    );
  }

  console.log(`✓ Postgres running on port ${POSTGRES_PORT}`);
  console.log(
    `  DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}`,
  );
}

function stopContainer(): void {
  if (isContainerRunning()) {
    console.log("\nStopping Postgres container...");
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: "inherit" });
    console.log("✓ Postgres stopped");
  }
}

// Start container
startContainer();

// Keep process alive and handle cleanup
console.log("\nPress Ctrl+C to stop Postgres...\n");

process.on("SIGINT", () => {
  stopContainer();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopContainer();
  process.exit(0);
});

// Keep alive
setInterval(() => {}, 1000);
