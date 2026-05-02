import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@el-audio-daw/db";
import {
  projects,
  projectUsers,
  tracks as tracksTable,
  samples as samplesTable,
  clips as clipsTable,
  user as userTable,
} from "@el-audio-daw/db/schema";
import { auth } from "@el-audio-daw/auth";
import { env } from "@el-audio-daw/env/api";
import { eq } from "drizzle-orm";
import { decodeWavHeader } from "./wav.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, "..", "seed", "assets");

const SEED_EMAIL = "dev@example.com";
const SEED_PASSWORD = "password123";
const SEED_NAME = "Dev User";

async function ensureUser(): Promise<string> {
  const existing = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, SEED_EMAIL))
    .limit(1);
  if (existing.length > 0 && existing[0]) {
    return existing[0].id;
  }
  const result = await auth.api.signUpEmail({
    body: { email: SEED_EMAIL, password: SEED_PASSWORD, name: SEED_NAME },
  });
  return result.user.id;
}

const s3 = new S3Client({
  region: env.STORAGE_REGION,
  endpoint: env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function uploadWav(key: string, body: Buffer): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.STORAGE_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: "audio/wav",
    }),
  );
}

const userId = await ensureUser();
console.log(`✓ user ${SEED_EMAIL}`);

const now = new Date();
const projectId = crypto.randomUUID();

await db.insert(projects).values({
  id: projectId,
  name: "Demo Project",
  duration: null,
  sampleRate: 44100,
  createdAt: now,
  updatedAt: now,
});

await db.insert(projectUsers).values({
  id: crypto.randomUUID(),
  projectId,
  userId,
  role: "owner",
  createdAt: now,
});
console.log(`✓ project ${projectId}`);

const trackDefs = [
  { name: "Bass", color: "#7e57c2" },
  { name: "Drums", color: "#ef5350" },
];
const trackIds: string[] = [];
for (let i = 0; i < trackDefs.length; i++) {
  const id = crypto.randomUUID();
  trackIds.push(id);
  const def = trackDefs[i];
  if (!def) continue;
  await db.insert(tracksTable).values({
    id,
    projectId,
    name: def.name,
    order: i,
    color: def.color,
    muted: false,
    solo: false,
    gain: 0,
    pan: 0,
    createdAt: now,
    updatedAt: now,
  });
}
console.log(`✓ ${trackIds.length} tracks`);

const seedAudio: { file: string; name: string; trackIndex: number }[] = [
  { file: "bass-sine.wav", name: "Bass Note", trackIndex: 0 },
  { file: "kick.wav", name: "Kick", trackIndex: 1 },
  { file: "hat.wav", name: "Hat", trackIndex: 1 },
];

const placedClips: { sampleId: string; durationSampleFrames: number; trackIndex: number }[] = [];

for (const item of seedAudio) {
  const buf = readFileSync(join(ASSETS_DIR, item.file));
  const { sampleRate, channels, durationSampleFrames } = decodeWavHeader(buf);
  const sampleId = crypto.randomUUID();
  const key = `projects/${projectId}/audio/${sampleId}-${item.file}`;
  await uploadWav(key, buf);
  await db.insert(samplesTable).values({
    id: sampleId,
    projectId,
    storageUrl: key,
    waveformUrl: null,
    name: item.name,
    durationSampleFrames,
    sampleRate,
    channels,
    createdAt: now,
  });
  placedClips.push({ sampleId, durationSampleFrames, trackIndex: item.trackIndex });
}
console.log(`✓ ${placedClips.length} samples uploaded`);

const trackCursors = new Map<number, number>();
for (const item of placedClips) {
  const trackId = trackIds[item.trackIndex];
  if (!trackId) continue;
  const cursor = trackCursors.get(item.trackIndex) ?? 0;
  await db.insert(clipsTable).values({
    id: crypto.randomUUID(),
    projectId,
    trackId,
    sampleId: item.sampleId,
    name: "Clip",
    startSampleFrame: cursor,
    durationSampleFrames: item.durationSampleFrames,
    sourceStartSampleFrame: 0,
    gain: 0,
    createdAt: now,
    updatedAt: now,
  });
  trackCursors.set(item.trackIndex, cursor + item.durationSampleFrames);
}
console.log(`✓ ${placedClips.length} clips placed`);

console.log(`\nLogin: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
process.exit(0);
