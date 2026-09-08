/**
 * Browser half — Secrets manager card for DSH settings.plugin.item.
 * Prebuilt CJS-compatible factory (client-modules loader), no heavy deps.
 * Fetches operator CRUD via /api/piblox-secrets.
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.dshPibloxSecretsClient = factory()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NS = 'piblox-secrets'
  const API = '/api/piblox-secrets'

  const DICT = {
    en: {
      title: 'Secrets',
      subtitle: 'Encrypted vault for API keys. Values stay off model context.',
      status: 'Vault',
      count: 'secrets',
      empty: 'No secrets yet. Add your first key below.',
      name: 'Name',
      value: 'Value',
      add: 'Add secret',
      saving: 'Saving…',
      reveal: 'Reveal',
      hide: 'Hide',
      delete: 'Delete',
      confirmDelete: 'Delete this secret?',
      nameHint: 'UPPER_SNAKE_CASE',
      error: 'Something went wrong',
      refreshed: 'Updated',
    },
  }

  function h(tag, props) {
    const el = document.createElement(tag)
    if (!props) return el
    for (const [k, v] of Object.entries(props)) {
      if (k === 'children') continue
      if (k === 'className') el.className = v
      else if (k === 'onClick') el.addEventListener('click', v)
      else if (k === 'onSubmit') el.addEventListener('submit', v)
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v)
      } else if (k === 'type' || k === 'value' || k === 'placeholder' || k === 'name') {
        el.setAttribute(k === 'value' ? 'value' : k, v)
        if (k === 'value' && 'value' in el) el.value = v
      } else if (v != null && k !== 'ref') el.setAttribute(k, String(v))
    }
    const kids = props.children
    if (kids == null) return el
    const list = Array.isArray(kids) ? kids : [kids]
    for (const child of list) {
      if (child == null || child === false) continue
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
    }
    return el
  }

  async function api(path, init) {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(init && init.headers) },
      ...init,
    })
    if (res.status === 204) return { ok: true }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data && data.error) || res.statusText)
    return data
  }

  function SecretsCard(props) {
    const t = (k) => (DICT.en[k] || k)
    const root = h('div', { className: 'dsh-piblox-secrets' })
    const style = document.createElement('style')
    style.textContent = `
      .dsh-piblox-secrets { display:flex; flex-direction:column; gap:1.25rem; max-width:40rem; font-family:inherit; }
      .dsh-piblox-secrets h2 { margin:0; font-size:1.25rem; letter-spacing:-0.02em; }
      .dsh-piblox-secrets .sub { opacity:0.72; margin:0.25rem 0 0; font-size:0.9rem; line-height:1.4; }
      .dsh-piblox-secrets .status { font-size:0.8rem; opacity:0.8; }
      .dsh-piblox-secrets .list { display:flex; flex-direction:column; gap:0.5rem; }
      .dsh-piblox-secrets .row { display:grid; grid-template-columns:1fr auto auto; gap:0.5rem; align-items:center;
        padding:0.65rem 0.75rem; border-radius:0.5rem; background:color-mix(in oklab, Canvas 92%, CanvasText 8%);
        animation: dshps-in 180ms ease-out; }
      @keyframes dshps-in { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:none;} }
      .dsh-piblox-secrets .row code { font-size:0.85rem; }
      .dsh-piblox-secrets .row button, .dsh-piblox-secrets form button {
        border:0; border-radius:0.4rem; padding:0.35rem 0.65rem; cursor:pointer;
        background:color-mix(in oklab, CanvasText 12%, transparent); color:inherit; }
      .dsh-piblox-secrets .row button.danger:hover { background:color-mix(in oklab, red 35%, transparent); }
      .dsh-piblox-secrets form { display:flex; flex-direction:column; gap:0.5rem; }
      .dsh-piblox-secrets label { display:flex; flex-direction:column; gap:0.25rem; font-size:0.8rem; opacity:0.9; }
      .dsh-piblox-secrets input { padding:0.5rem 0.65rem; border-radius:0.4rem; border:1px solid color-mix(in oklab, CanvasText 18%, transparent);
        background:transparent; color:inherit; font:inherit; }
      .dsh-piblox-secrets .value-row { display:flex; gap:0.35rem; align-items:center; }
      .dsh-piblox-secrets .value-row input { flex:1; }
      .dsh-piblox-secrets .err { color:tomato; font-size:0.85rem; }
      .dsh-piblox-secrets .empty { opacity:0.65; font-size:0.9rem; padding:0.5rem 0; }
    `
    root.appendChild(style)

    const title = h('div', {
      children: [
        h('h2', { children: t('title') }),
        h('p', { className: 'sub', children: t('subtitle') }),
      ],
    })
    const statusEl = h('div', { className: 'status', children: '…' })
    const listEl = h('div', { className: 'list' })
    const errEl = h('div', { className: 'err', children: '' })

    let showValue = false
    const nameInput = h('input', {
      name: 'name',
      placeholder: t('nameHint'),
      autocomplete: 'off',
      spellcheck: 'false',
    })
    const valueInput = h('input', {
      name: 'value',
      type: 'password',
      placeholder: '••••••••',
      autocomplete: 'new-password',
    })
    const toggleBtn = h('button', {
      type: 'button',
      children: t('reveal'),
      onClick: () => {
        showValue = !showValue
        valueInput.type = showValue ? 'text' : 'password'
        toggleBtn.textContent = showValue ? t('hide') : t('reveal')
      },
    })
    const form = h('form', {
      onSubmit: async (e) => {
        e.preventDefault()
        errEl.textContent = ''
        const name = String(nameInput.value || '').trim()
        const value = String(valueInput.value || '')
        if (!name || !value) return
        try {
          await api('', { method: 'POST', body: JSON.stringify({ name, value }) })
          nameInput.value = ''
          valueInput.value = ''
          await refresh()
        } catch (err) {
          errEl.textContent = err.message || t('error')
        }
      },
      children: [
        h('label', { children: [t('name'), nameInput] }),
        h('label', {
          children: [
            t('value'),
            h('div', { className: 'value-row', children: [valueInput, toggleBtn] }),
          ],
        }),
        h('button', { type: 'submit', children: t('add') }),
      ],
    })

    root.appendChild(title)
    root.appendChild(statusEl)
    root.appendChild(listEl)
    root.appendChild(form)
    root.appendChild(errEl)

    async function refresh() {
      try {
        const [st, names] = await Promise.all([api('/status'), api('/names')])
        statusEl.textContent = `${t('status')}: ${st.count ?? 0} ${t('count')} · ${st.dataDir || ''}`
        listEl.replaceChildren()
        const items = (names && names.items) || []
        if (!items.length) {
          listEl.appendChild(h('div', { className: 'empty', children: t('empty') }))
          return
        }
        for (const item of items) {
          const name = item.name
          let revealed = false
          const revealBtn = h('button', {
            type: 'button',
            children: t('reveal'),
            onClick: async () => {
              if (revealed) {
                code.textContent = name
                revealBtn.textContent = t('reveal')
                revealed = false
                return
              }
              try {
                const r = await api('/' + encodeURIComponent(name))
                code.textContent = r.value
                revealBtn.textContent = t('hide')
                revealed = true
              } catch (err) {
                errEl.textContent = err.message || t('error')
              }
            },
          })
          const delBtn = h('button', {
            type: 'button',
            className: 'danger',
            children: t('delete'),
            onClick: async () => {
              if (!confirm(t('confirmDelete'))) return
              try {
                await api('/' + encodeURIComponent(name), { method: 'DELETE' })
                await refresh()
              } catch (err) {
                errEl.textContent = err.message || t('error')
              }
            },
          })
          const code = h('code', { children: name })
          listEl.appendChild(
            h('div', { className: 'row', children: [code, revealBtn, delBtn] }),
          )
        }
      } catch (err) {
        errEl.textContent = err.message || t('error')
      }
    }

    void refresh()
    // props unused but kept for slot inject compatibility
    void props
    return root
  }

  function apply(ctx) {
    const injectServices = ['slots', 'locale', 'settingsScope']
    if (!ctx.slots || !ctx.slots.inject) return
    ctx.slots.inject('settings.plugin.item', function* () {
      yield ctx.slots.register(
        {
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => ({}),
        },
        SecretsCard,
      )
    })
    void injectServices
  }

  return {
    apply,
    inject: ['slots', 'locale', 'settingsScope'],
    name: 'dsh-piblox-secrets/client',
  }
})
