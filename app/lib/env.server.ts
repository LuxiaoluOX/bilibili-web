import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  DEMO_MODE: z.enum(["true", "false"]).default("false"),
  BILIBILI_REQUEST_INTERVAL_MS: z.coerce.number().int().min(1000).default(3500),
  BILIBILI_REQUEST_JITTER_MS: z.coerce.number().int().min(0).default(1500),
});

export const env = schema.parse(process.env);
export const demoMode = env.DEMO_MODE === "true";
