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
    let useRef = react.useRef;

    const SECTION_ID = "secrets";
    const LOCALE_NS = "settings.secrets";
    const API = "/api/piblox-secrets";
    const MASK = "••••••••••••••••";

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
        show: "Show value",
        hide: "Hide value",
        delete: "Delete",
        confirmDelete: "Delete this secret?",
        nameHint: "UPPER_SNAKE_CASE",
        saved: "Saved",
        saving: "Saving…",
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
        show: "显示",
        hide: "隐藏",
        delete: "删除",
        confirmDelete: "删除此密钥？",
        nameHint: "UPPER_SNAKE_CASE",
        saved: "已保存",
        saving: "保存中…",
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

    const iconBtn = {
      type: "button",
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2rem",
        height: "2rem",
        padding: 0,
        borderRadius: "0.4rem",
        border: "1px solid color-mix(in oklab, CanvasText 18%, transparent)",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        flexShrink: 0,
      },
    };

    function IconEye({ open }) {
      // Minimal stroke icons — no brand logos
      if (open) {
        return jsxs("svg", {
          width: 16,
          height: 16,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          "aria-hidden": true,
          children: [
            jsx("path", { d: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" }),
            jsx("path", { d: "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" }),
            jsx("line", { x1: 1, y1: 1, x2: 23, y2: 23 }),
          ],
        });
      }
      return jsxs("svg", {
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        "aria-hidden": true,
        children: [
          jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
          jsx("circle", { cx: 12, cy: 12, r: 3 }),
        ],
      });
    }

    function IconTrash() {
      return jsxs("svg", {
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        "aria-hidden": true,
        children: [
          jsx("polyline", { points: "3 6 5 6 21 6" }),
          jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }),
        ],
      });
    }

    function SecretRow({ item, t, onError, onDeleted }) {
      const [draft, setDraft] = useState("");
      const [loaded, setLoaded] = useState(false);
      const [visible, setVisible] = useState(false);
      const [dirty, setDirty] = useState(false);
      const [saveState, setSaveState] = useState(""); // '' | saving | saved
      const baseline = useRef("");

      async function ensureLoaded() {
        if (loaded) return baseline.current;
        const r = await api("/" + encodeURIComponent(item.name));
        const val = r.value || "";
        baseline.current = val;
        setDraft(val);
        setLoaded(true);
        return val;
      }

      async function onToggleVisible() {
        try {
          await ensureLoaded();
          setVisible((v) => !v);
        } catch (e) {
          onError((e && e.message) || t("error"));
        }
      }

      async function onFocus() {
        if (loaded) return;
        try {
          await ensureLoaded();
        } catch (e) {
          onError((e && e.message) || t("error"));
        }
      }

      function onChange(ev) {
        setDraft(ev.target.value);
        setDirty(true);
        setSaveState("");
      }

      async function persist(next) {
        if (!next) return;
        if (next === baseline.current) {
          setDirty(false);
          return;
        }
        setSaveState("saving");
        try {
          await api("", { method: "POST", body: JSON.stringify({ name: item.name, value: next }) });
          baseline.current = next;
          setDirty(false);
          setLoaded(true);
          setSaveState("saved");
          setTimeout(() => setSaveState((s) => (s === "saved" ? "" : s)), 1200);
        } catch (e) {
          setSaveState("");
          onError((e && e.message) || t("error"));
        }
      }

      async function onBlur() {
        if (!dirty) return;
        await persist(draft);
      }

      async function onDelete() {
        if (!confirm(t("confirmDelete"))) return;
        try {
          await api("/" + encodeURIComponent(item.name), { method: "DELETE" });
          onDeleted();
        } catch (e) {
          onError((e && e.message) || t("error"));
        }
      }

      return jsxs("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "minmax(7rem, 11rem) 1fr auto auto",
          gap: "0.5rem",
          alignItems: "center",
          padding: "0.65rem 0.75rem",
          borderRadius: "0.5rem",
          background: "color-mix(in oklab, Canvas 92%, CanvasText 8%)",
        },
        children: [
          jsx("code", {
            style: { fontSize: "0.8rem", wordBreak: "break-all", opacity: 0.9 },
            children: item.name,
          }),
          jsxs("div", {
            style: { display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 },
            children: [
              jsx("input", {
                type: visible ? "text" : "password",
                value: loaded ? draft : "",
                placeholder: loaded ? "" : MASK,
                autoComplete: "off",
                spellCheck: false,
                onFocus: () => void onFocus(),
                onChange: onChange,
                onBlur: () => void onBlur(),
                "aria-label": item.name,
                style: {
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "0.4rem",
                  border: "1px solid color-mix(in oklab, CanvasText 18%, transparent)",
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  fontSize: "0.85rem",
                },
              }),
              saveState
                ? jsx("span", {
                    style: { fontSize: "0.7rem", opacity: 0.65 },
                    children: saveState === "saving" ? t("saving") : t("saved"),
                  })
                : null,
            ],
          }),
          jsx("button", {
            ...iconBtn,
            title: visible ? t("hide") : t("show"),
            "aria-label": visible ? t("hide") : t("show"),
            onClick: () => void onToggleVisible(),
            children: jsx(IconEye, { open: visible }),
          }),
          jsx("button", {
            ...iconBtn,
            title: t("delete"),
            "aria-label": t("delete"),
            onClick: () => void onDelete(),
            children: jsx(IconTrash, {}),
          }),
        ],
      });
    }

    function SecretsSection(props) {
      const t = (props && props.t) || ((k) => DICT.en[k] || k);
      const [items, setItems] = useState([]);
      const [status, setStatus] = useState(null);
      const [err, setErr] = useState("");
      const [name, setName] = useState("");
      const [value, setValue] = useState("");
      const [showValue, setShowValue] = useState(false);
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

      return jsxs("div", {
        className: "dsh-piblox-secrets",
        style: {
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          maxWidth: "44rem",
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
                  jsx(
                    SecretRow,
                    {
                      item: item,
                      t: t,
                      onError: setErr,
                      onDeleted: () => void refresh(),
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
                        placeholder: MASK,
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
                        ...iconBtn,
                        type: "button",
                        title: showValue ? t("hide") : t("show"),
                        "aria-label": showValue ? t("hide") : t("show"),
                        onClick: () => setShowValue((v) => !v),
                        children: jsx(IconEye, { open: showValue }),
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

      // Settings sidebar only — do not also register settings.plugin.item (duplicate vault UI).
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
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "settingsScope"];
    return module.exports;
  },
});
