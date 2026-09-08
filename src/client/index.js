window.__ModuleLoader__.load({
  id: "dsh-piblox-secrets",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");
    let jsx = jsxRuntime.jsx;
    let jsxs = jsxRuntime.jsxs;
    let useState = react.useState;
    let useEffect = react.useEffect;
    let useCallback = react.useCallback;

    const SECTION_ID = "secrets";
    const LOCALE_NS = "settings.secrets";
    const API = "/api/piblox-secrets";

    const DICT = {
      en: {
        nav: "Secrets",
        title: "Secrets",
        subtitle: "Encrypted vault for API keys. Values stay off model context.",
        status: "Vault",
        count: "secrets",
        empty: "No secrets yet. Add your first key below.",
        name: "Name",
        value: "Value",
        add: "Add secret",
        reveal: "Reveal",
        hide: "Hide",
        delete: "Delete",
        confirmDelete: "Delete this secret?",
        nameHint: "UPPER_SNAKE_CASE",
        error: "Something went wrong",
        loading: "Loading…",
      },
      zh: {
        nav: "密钥",
        title: "密钥",
        subtitle: "加密保管 API 密钥。模型上下文不会看到明文。",
        status: "保险库",
        count: "项",
        empty: "还没有密钥。在下方添加第一条。",
        name: "名称",
        value: "值",
        add: "添加密钥",
        reveal: "显示",
        hide: "隐藏",
        delete: "删除",
        confirmDelete: "删除此密钥？",
        nameHint: "UPPER_SNAKE_CASE",
        error: "出错了",
        loading: "加载中…",
      },
    };

    function tBound(ctx) {
      try {
        return ctx.locale.bind(LOCALE_NS);
      } catch {
        return (key) => DICT.en[key] || key;
      }
    }

    async function api(path, init) {
      const res = await fetch(API + path, {
        credentials: "same-origin",
        headers: { "content-type": "application/json", ...(init && init.headers) },
        ...init,
      });
      if (res.status === 204) return { ok: true };
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || res.statusText);
      return data;
    }

    function SecretsSection(props) {
      const t = (props && props.t) || ((k) => DICT.en[k] || k);
      const [items, setItems] = useState([]);
      const [status, setStatus] = useState(null);
      const [err, setErr] = useState("");
      const [name, setName] = useState("");
      const [value, setValue] = useState("");
      const [showValue, setShowValue] = useState(false);
      const [revealed, setRevealed] = useState({});
      const [busy, setBusy] = useState(false);

      const refresh = useCallback(async () => {
        setErr("");
        try {
          const [st, names] = await Promise.all([api("/status"), api("/names")]);
          setStatus(st);
          setItems((names && names.items) || []);
        } catch (e) {
          setErr((e && e.message) || t("error"));
        }
      }, [t]);

      useEffect(() => {
        void refresh();
      }, [refresh]);

      async function onAdd(e) {
        e.preventDefault();
        if (!name.trim() || !value) return;
        setBusy(true);
        setErr("");
        try {
          await api("", { method: "POST", body: JSON.stringify({ name: name.trim(), value }) });
          setName("");
          setValue("");
          await refresh();
        } catch (err2) {
          setErr((err2 && err2.message) || t("error"));
        } finally {
          setBusy(false);
        }
      }

      async function onReveal(secretName) {
        if (revealed[secretName] != null) {
          setRevealed((prev) => {
            const next = { ...prev };
            delete next[secretName];
            return next;
          });
          return;
        }
        try {
          const r = await api("/" + encodeURIComponent(secretName));
          setRevealed((prev) => ({ ...prev, [secretName]: r.value }));
        } catch (err2) {
          setErr((err2 && err2.message) || t("error"));
        }
      }

      async function onDelete(secretName) {
        if (!confirm(t("confirmDelete"))) return;
        try {
          await api("/" + encodeURIComponent(secretName), { method: "DELETE" });
          await refresh();
        } catch (err2) {
          setErr((err2 && err2.message) || t("error"));
        }
      }

      return jsxs("div", {
        className: "dsh-piblox-secrets",
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          maxWidth: "40rem",
        },
        children: [
          jsxs("div", {
            children: [
              jsx("h2", {
                style: { margin: 0, fontSize: "1.25rem", letterSpacing: "-0.02em" },
                children: t("title"),
              }),
              jsx("p", {
                style: { opacity: 0.72, margin: "0.25rem 0 0", fontSize: "0.9rem", lineHeight: 1.4 },
                children: t("subtitle"),
              }),
            ],
          }),
          jsx("div", {
            style: { fontSize: "0.8rem", opacity: 0.8 },
            children: status
              ? `${t("status")}: ${status.count ?? 0} ${t("count")}${status.dataDir ? " · " + status.dataDir : ""}`
              : t("loading"),
          }),
          jsx("div", {
            style: { display: "flex", flexDirection: "column", gap: "0.5rem" },
            children: items.length
              ? items.map((item) =>
                  jsxs(
                    "div",
                    {
                      style: {
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        gap: "0.5rem",
                        alignItems: "center",
                        padding: "0.65rem 0.75rem",
                        borderRadius: "0.5rem",
                        background: "color-mix(in oklab, Canvas 92%, CanvasText 8%)",
                      },
                      children: [
                        jsx("code", {
                          style: { fontSize: "0.85rem", wordBreak: "break-all" },
                          children: revealed[item.name] != null ? revealed[item.name] : item.name,
                        }),
                        jsx("button", {
                          type: "button",
                          onClick: () => void onReveal(item.name),
                          children: revealed[item.name] != null ? t("hide") : t("reveal"),
                        }),
                        jsx("button", {
                          type: "button",
                          onClick: () => void onDelete(item.name),
                          children: t("delete"),
                        }),
                      ],
                    },
                    item.name,
                  ),
                )
              : jsx("div", {
                  style: { opacity: 0.65, fontSize: "0.9rem", padding: "0.5rem 0" },
                  children: t("empty"),
                }),
          }),
          jsxs("form", {
            onSubmit: onAdd,
            style: { display: "flex", flexDirection: "column", gap: "0.5rem" },
            children: [
              jsxs("label", {
                style: { display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" },
                children: [
                  t("name"),
                  jsx("input", {
                    value: name,
                    placeholder: t("nameHint"),
                    autoComplete: "off",
                    spellCheck: false,
                    onChange: (ev) => setName(ev.target.value),
                    style: {
                      padding: "0.5rem 0.65rem",
                      borderRadius: "0.4rem",
                      border: "1px solid color-mix(in oklab, CanvasText 18%, transparent)",
                      background: "transparent",
                      color: "inherit",
                      font: "inherit",
                    },
                  }),
                ],
              }),
              jsxs("label", {
                style: { display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" },
                children: [
                  t("value"),
                  jsxs("div", {
                    style: { display: "flex", gap: "0.35rem", alignItems: "center" },
                    children: [
                      jsx("input", {
                        type: showValue ? "text" : "password",
                        value: value,
                        placeholder: "••••••••",
                        autoComplete: "new-password",
                        onChange: (ev) => setValue(ev.target.value),
                        style: {
                          flex: 1,
                          padding: "0.5rem 0.65rem",
                          borderRadius: "0.4rem",
                          border: "1px solid color-mix(in oklab, CanvasText 18%, transparent)",
                          background: "transparent",
                          color: "inherit",
                          font: "inherit",
                        },
                      }),
                      jsx("button", {
                        type: "button",
                        onClick: () => setShowValue((v) => !v),
                        children: showValue ? t("hide") : t("reveal"),
                      }),
                    ],
                  }),
                ],
              }),
              jsx("button", {
                type: "submit",
                disabled: busy || !name.trim() || !value,
                children: busy ? t("loading") : t("add"),
              }),
            ],
          }),
          err
            ? jsx("div", {
                style: { color: "tomato", fontSize: "0.85rem" },
                children: err,
              })
            : null,
        ],
      });
    }

    function apply(ctx) {
      if (!ctx.slots || !ctx.slots.inject) return;

      ctx.effect(
        () => ctx.locale.register(LOCALE_NS, { en: DICT.en, zh: DICT.zh }),
        "dsh-piblox-secrets: locale",
      );

      const t = tBound(ctx);
      const injected = () => ({ t });

      // First-class Settings sidebar entry (same level as General / Models / Plugins)
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: SECTION_ID,
            order: 15,
            label: () => t("nav"),
            locale: LOCALE_NS,
            inject: injected,
          },
          SecretsSection,
        ),
      );

      // Also keep a card under Plugins → Plugin configuration
      ctx.slots.inject("settings.plugin.item", () =>
        ctx.slots.register(
          {
            name: "settings.plugin.item",
            key: "piblox-secrets",
            locale: LOCALE_NS,
            inject: injected,
          },
          SecretsSection,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "settingsScope"];
    return module.exports;
  },
});
