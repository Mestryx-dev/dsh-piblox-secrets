import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface ParsedSkill {
  name: string
  description: string
  whenToUse?: string
  content: string
  path: string
}

/** Minimal YAML-ish frontmatter with multiline scalars (`>`, `>-`, `|`). */
export function parseSkillMarkdownMultiline(text: string): {
  frontmatter: Record<string, string>
  body: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return { frontmatter: {}, body: text.trimStart() }

  const frontmatter: Record<string, string> = {}
  const fmLines = match[1].split(/\r?\n/)
  let i = 0
  while (i < fmLines.length) {
    const line = fmLines[i]!
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!kv) {
      i += 1
      continue
    }
    const key = kv[1]!
    const rest = kv[2]!.trim()
    if (rest === '>' || rest === '>-' || rest === '|') {
      const collected: string[] = []
      i += 1
      while (i < fmLines.length && /^\s+/.test(fmLines[i]!) && !/^[A-Za-z][\w-]*:/.test(fmLines[i]!)) {
        collected.push(fmLines[i]!.replace(/^\s+/, ''))
        i += 1
      }
      frontmatter[key] = collected.join(rest === '|' ? '\n' : ' ').trim()
      continue
    }
    frontmatter[key] = rest
    i += 1
  }
  return { frontmatter, body: match[2].trimStart() }
}

export function resolveBundledSkillPath(packageRoot: string): string | null {
  const flat = join(packageRoot, 'skills', 'dsh-piblox-secrets.md')
  if (existsSync(flat)) return flat
  const nested = join(packageRoot, 'skills', 'dsh-piblox-secrets', 'SKILL.md')
  if (existsSync(nested)) return nested
  return null
}

export function loadBundledSkill(packageRoot: string): ParsedSkill | null {
  const path = resolveBundledSkillPath(packageRoot)
  if (!path) return null
  const raw = readFileSync(path, 'utf8')
  const { frontmatter, body } = parseSkillMarkdownMultiline(raw)
  const name = frontmatter.name
  const description = frontmatter.description
  if (!name || !SKILL_NAME_RE.test(name) || !description) return null
  return {
    name,
    description,
    ...(frontmatter.whenToUse ? { whenToUse: frontmatter.whenToUse } : {}),
    content: body,
    path,
  }
}

/** Package root: dist/ → parent; or src/ during tests via import.meta. */
export function packageRootFromModuleUrl(moduleUrl: string): string {
  const here = dirname(fileURLToPath(moduleUrl))
  // dist/register-skill.js → package root; src/register-skill.ts → package root
  return join(here, '..')
}

export type SkillRegisterCtx = {
  logger?: { info?: (m: string) => void; warn?: (m: string) => void }
  effect?: (fn: () => (() => void) | void, label?: string) => void
  get?: (name: string) => unknown
}

/**
 * Soft-register the bundled skill when `ctx.skills` is present.
 * No-op on headless profiles without dsh-skill — tools still work.
 */
export function registerBundledSkill(ctx: SkillRegisterCtx, packageRoot?: string): boolean {
  const skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined
  const api = skills as { register?: (skill: Record<string, unknown>) => () => void } | undefined
  if (typeof api?.register !== 'function') {
    ctx.logger?.info?.('dsh-piblox-secrets: skills service absent — bundled skill skipped')
    return false
  }

  const root = packageRoot ?? packageRootFromModuleUrl(import.meta.url)
  let skill: ParsedSkill | null
  try {
    skill = loadBundledSkill(root)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.logger?.warn?.(`dsh-piblox-secrets: skill read failed: ${msg}`)
    return false
  }
  if (!skill) {
    ctx.logger?.warn?.(`dsh-piblox-secrets: bundled skill missing or invalid under ${root}/skills`)
    return false
  }

  const registration = {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
    content: skill.content,
    source: 'bundled',
    path: skill.path,
  }

  // Must call as method on the service (Cordis binds `this.ctx`); do not extract `.register`.
  const run = () => api.register!(registration)
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => run(), 'dsh-piblox-secrets: skill')
  } else {
    run()
  }
  ctx.logger?.info?.(`dsh-piblox-secrets: registered skill ${skill.name}`)
  return true
}
