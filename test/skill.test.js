import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  loadBundledSkill,
  parseSkillMarkdownMultiline,
  registerBundledSkill,
} from '../dist/register-skill.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('bundled skill', () => {
  it('parses multiline frontmatter', () => {
    const raw = `---
name: dsh-piblox-secrets
description: >-
  First line
  second line
whenToUse: >-
  when A
  or B
---

# Body
`
    const { frontmatter, body } = parseSkillMarkdownMultiline(raw)
    assert.equal(frontmatter.name, 'dsh-piblox-secrets')
    assert.match(frontmatter.description, /First line/)
    assert.match(frontmatter.description, /second line/)
    assert.match(frontmatter.whenToUse, /when A/)
    assert.match(body, /^# Body/)
  })

  it('loads shipped skill file', () => {
    const skill = loadBundledSkill(root)
    assert.ok(skill)
    assert.equal(skill.name, 'dsh-piblox-secrets')
    assert.ok(skill.description.length > 20)
    assert.ok(skill.content.includes('secrets_list_names'))
    assert.ok(skill.content.includes('Never'))
  })

  it('registerBundledSkill calls skills.register', () => {
    const calls = []
    const skillsApi = {
      register(reg) {
        calls.push(reg)
        return () => {}
      },
    }
    const ok = registerBundledSkill(
      {
        get: (name) => (name === 'skills' ? skillsApi : undefined),
        effect: (fn) => {
          fn()
        },
      },
      root,
    )
    assert.equal(ok, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].name, 'dsh-piblox-secrets')
    assert.equal(calls[0].source, 'bundled')
    assert.ok(String(calls[0].content).includes('Hard rules'))
  })

  it('skips when skills service absent', () => {
    const ok = registerBundledSkill({ get: () => undefined }, root)
    assert.equal(ok, false)
  })
})
