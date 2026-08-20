export function blockPreviewScript() {
  return `<script>
    (() => {
      const panel = document.querySelector("[data-block-preview]");
      const form = panel?.closest("form");
      const frame = panel?.querySelector("iframe");
      const viewport = panel?.querySelector("[data-preview-viewport]");
      const editor = form?.querySelector("textarea[name=bodyHtml]");
      if (!panel || !form || !frame || !viewport || !editor) return;
      const rootStyle = getComputedStyle(document.documentElement);
      const token = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
      const css = ${JSON.stringify(`
        * { box-sizing: border-box; }
        html, body { overflow-x: clip; }
        body { background: var(--preview-bg); color: var(--preview-ink); font-family: var(--preview-font); line-height: 1.7; margin: 0; padding: clamp(16px, 5vw, 40px); }
        h1, h2, h3, h4 { font-style: normal; overflow-wrap: anywhere; }
        img, video { height: auto; max-width: 100%; }
        a { color: var(--preview-accent); }
        .hsc-layout-block { margin: 0; min-width: 0; }
        .hsc-layout-block > :first-child { margin-top: 0; }
        .hsc-layout-block > :last-child { margin-bottom: 0; }
        .hsc-layout-block--feature { background: var(--preview-panel); border-block: 1px solid var(--preview-line); padding: clamp(32px, 7vw, 72px) clamp(16px, 6vw, 56px); text-align: center; }
        .hsc-layout-block--feature > * { margin-inline: auto; max-width: 52rem; }
        .hsc-layout-block--split { display: grid; gap: 32px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .hsc-layout-block--grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); }
        .hsc-layout-block--grid > * { background: var(--preview-panel); border: 1px solid var(--preview-line); margin: 0; min-width: 0; padding: 16px; }
        .hsc-layout-block--notice { background: var(--preview-accent-soft); border-left: 3px solid var(--preview-accent); padding: 16px 20px; }
        @media (max-width: 620px) { .hsc-layout-block--split { grid-template-columns: minmax(0, 1fr); } }
      `)};
      let previous = "";
      const render = () => {
        const layout = form.querySelector('input[name="layoutType"]:checked')?.value || "plain";
        const signature = layout + "\u0000" + editor.value;
        if (signature === previous) return;
        previous = signature;
        const variables = [
          ["--preview-bg", token("--bg", "white")], ["--preview-panel", token("--panel", "white")],
          ["--preview-ink", token("--ink", "black")], ["--preview-line", token("--line", "gray")],
          ["--preview-accent", token("--accent", "teal")], ["--preview-accent-soft", token("--accent-light", "transparent")],
          ["--preview-font", token("--font-sans", "sans-serif")]
        ].map(([name, value]) => name + ":" + value).join(";");
        frame.srcdoc = ${JSON.stringify(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>:root{`)} + variables + "}" + css + ${JSON.stringify(`</style></head><body><section class="hsc-layout-block hsc-layout-block--`)} + layout + '">' + editor.value + ${JSON.stringify(`</section></body></html>`)};
      };
      panel.addEventListener("click", (event) => {
        const button = event.target.closest("[data-preview-size]");
        if (!button) return;
        viewport.dataset.previewViewport = button.dataset.previewSize;
        panel.querySelectorAll("[data-preview-size]").forEach((item) => { const active = item === button; item.classList.toggle("is-active", active); item.setAttribute("aria-pressed", String(active)); });
      });
      form.addEventListener("input", render);
      form.addEventListener("change", render);
      setInterval(render, 500);
      render();
    })();
  </script>`;
}
