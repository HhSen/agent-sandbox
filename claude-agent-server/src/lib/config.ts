import { z } from 'zod'

import { permissionModeSchema, settingSourceSchema } from './claude/sdk-schemas.js'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CLAUDE_WRAPPER_DEFAULT_MODEL: z.string().optional(),
  CLAUDE_WRAPPER_DEFAULT_PERMISSION_MODE: permissionModeSchema.default('default'),
  CLAUDE_WRAPPER_DEFAULT_SETTING_SOURCES: z
    .string()
    .default('project,user,local')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(settingSourceSchema)),
  CLAUDE_WRAPPER_REQUIRE_AUTH_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
})

const parsed = envSchema.parse(process.env)

export const config = {
  host: parsed.HOST,
  port: parsed.PORT,
  defaultModel: parsed.CLAUDE_WRAPPER_DEFAULT_MODEL,
  defaultPermissionMode: parsed.CLAUDE_WRAPPER_DEFAULT_PERMISSION_MODE,
  defaultSettingSources: parsed.CLAUDE_WRAPPER_DEFAULT_SETTING_SOURCES,
  authToken: parsed.CLAUDE_WRAPPER_REQUIRE_AUTH_TOKEN,
  logLevel: parsed.LOG_LEVEL,
}
