import { describe, expect, it } from 'vitest'
import { HttpError } from '../../../src/lib/http/errors.js'
import {
  patchModelBodySchema,
  patchPermissionModeBodySchema,
  setSessionPermissionMode,
} from '../../../src/lib/claude/session-service.js'

describe('patchModelBodySchema', () => {
  it('accepts a model string', () => {
    expect(patchModelBodySchema.parse({ model: 'claude-sonnet-4-6' })).toEqual({
      model: 'claude-sonnet-4-6',
    })
  })

  it('accepts an empty body (model is optional)', () => {
    expect(patchModelBodySchema.parse({})).toEqual({})
  })
})

describe('patchPermissionModeBodySchema', () => {
  it('accepts valid permission modes', () => {
    expect(patchPermissionModeBodySchema.parse({ permissionMode: 'default' })).toEqual({
      permissionMode: 'default',
    })
    expect(patchPermissionModeBodySchema.parse({ permissionMode: 'acceptEdits' })).toEqual({
      permissionMode: 'acceptEdits',
    })
  })

  it('rejects an unknown permission mode', () => {
    expect(() => patchPermissionModeBodySchema.parse({ permissionMode: 'unknown' })).toThrow()
  })

  it('rejects missing permissionMode', () => {
    expect(() => patchPermissionModeBodySchema.parse({})).toThrow()
  })
})

describe('setSessionPermissionMode', () => {
  it('throws 400 when permissionMode is bypassPermissions', async () => {
    await expect(
      setSessionPermissionMode('any-session-id', 'bypassPermissions'),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.statusCode === 400,
    )
  })
})
