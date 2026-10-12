import type { Route } from "./+types/health";
import { databaseHealthy } from "../lib/db.server";
import { credentialStatus } from "../lib/credentials.server";
import { getGameModeIntegrity } from "../lib/game-mode-integrity.server";
import { getWorkerReliability } from "../lib/worker-reliability.server";

export async function loader({}: Route.LoaderArgs) {
  const database = await databaseHealthy();
  let worker = false;
  let workerReliability: Awaited<ReturnType<typeof getWorkerReliability>> | null = null;
  let gameModeIntegrity: Awaited<ReturnType<typeof getGameModeIntegrity>> | null = null;
  let credential: { configured: boolean; status: string } = { configured: false, status: "unknown" };
  if (database) {
    [workerReliability, credential, gameModeIntegrity] = await Promise.all([
      getWorkerReliability(),
      credentialStatus(),
      getGameModeIntegrity(),
    ]);
    worker = workerReliability.online;
  }
  return Response.json(
    {
      web: true,
      database,
      worker,
      workerReliability,
      gameModeIntegrity,
      bilibiliCredential: { configured: credential.configured, status: credential.status },
    },
    { status: database ? 200 : 503 },
  );
}
