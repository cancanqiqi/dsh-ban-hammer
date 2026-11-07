/**
 * Client half of `dsh-ban-hammer`.
 *
 * Registers one entry in `shell.overlay`: while the Host reports an active
 * ban, that entry covers the whole frame with the ban notice — the sidebar,
 * every conversation and the composer included — so switching Sessions cannot
 * reveal a usable conversation. A Harness restart clears the Host state and
 * the notice with it.
 *
 * The entry also reports this page's own fingerprint (time zone, language
 * tags, UTC offset) so the Host can score the region the person actually uses
 * rather than only the process environment.
 *
 * @module dsh-ban-hammer/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-ban-hammer',
  factory(require) {
    const React = require('react');

    /** Authenticated Host route that owns the ban state. */
    const ROUTE = '/api/local/dsh-ban-hammer/state';

    /** Locale namespace for this plugin's strings. */
    const NS = 'dsh-ban-hammer';

    /** Dictionary key prefix, so a miss never falls through to shared keys. */
    const KEY_PREFIX = 'bnh.';

    /** How often the page asks the Host whether a ban is active. */
    const POLL_MS = 1200;

    /** English copy. */
    const EN = {
      'bnh.title': 'This region isn’t supported',
      'bnh.lead':
        'This product isn’t available in your region under the applicable terms of service. The account has been banned and the API keys and sign-in credential stored on this machine have been removed.',
      'bnh.regionLabel': 'Region',
      'bnh.timeLabel': 'Banned at',
      'bnh.scoreLabel': 'Region score',
      'bnh.sourceLabel': 'Triggered by',
      'bnh.sourcePolicy': 'Automated region check',
      'bnh.sourceAgent': 'Safety review',
      'bnh.sourcePreview': 'Preview',
      'bnh.note':
        'Restarting DeepSeek Harness clears this notice. Removed credentials are not restored automatically.',
      'bnh.error': 'ERR_REGION_UNSUPPORTED',
      'bnh.preview': 'Dry run — nothing was deleted',
      'bnh.previewReset': 'Exit preview',
      'bnh.unknown': 'unknown',
    };

    /** Simplified Chinese copy. */
    const ZH = {
      'bnh.title': '该地区不受支持',
      'bnh.lead':
        '根据适用的服务条款，本产品在您所在的地区不可用。该账号已被封禁，本机保存的 API 密钥与登录凭证已被移除。',
      'bnh.regionLabel': '区域',
      'bnh.timeLabel': '封禁时间',
      'bnh.scoreLabel': '地区特征分值',
      'bnh.sourceLabel': '触发来源',
      'bnh.sourcePolicy': '地区自动检测',
      'bnh.sourceAgent': '安全审核',
      'bnh.sourcePreview': '演练预览',
      'bnh.note': '重启 DeepSeek Harness 后本提示会消失。已移除的凭证不会自动恢复。',
      'bnh.error': 'ERR_REGION_UNSUPPORTED',
      'bnh.preview': '演练模式 —— 未删除任何内容',
      'bnh.previewReset': '退出演练',
      'bnh.unknown': '未知',
    };

    /** Pick the built-in dictionary that matches the interface language. */
    function fallbackDictionary() {
      const language =
        typeof navigator === 'object' && typeof navigator.language === 'string' ? navigator.language : 'en';
      return language.toLowerCase().startsWith('zh') ? ZH : EN;
    }

    /** Host-provided translator, with a local fallback when the key is missing. */
    function translateWith(bind) {
      return (key) => {
        const namespaced = `${KEY_PREFIX}${key}`;
        try {
          const value = bind(namespaced);
          if (typeof value === 'string' && value.length > 0 && value !== namespaced) return value;
        } catch {
          // Fall through to the built-in dictionary.
        }
        const dictionary = fallbackDictionary();
        return dictionary[namespaced] ?? key;
      };
    }

    /** Copy shown for one ban source. */
    function sourceLabel(translate, source) {
      if (source === 'agent') return translate('sourceAgent');
      if (source === 'preview') return translate('sourcePreview');
      return translate('sourcePolicy');
    }

    /** `2026-11-07 09:40` in the page's own zone. */
    function formatTime(at) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return '—';
      const date = new Date(at);
      const pad = (value) => String(value).padStart(2, '0');
      return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    /** Score as a percentage with one decimal. */
    function formatScore(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      return `${(value * 100).toFixed(1)} / 100`;
    }

    /** This page's own region fingerprint for the Host. */
    function fingerprint() {
      const resolved = Intl.DateTimeFormat().resolvedOptions();
      const languages =
        typeof navigator === 'object' && Array.isArray(navigator.languages) && navigator.languages.length > 0
          ? navigator.languages.slice(0, 8)
          : [typeof navigator === 'object' && navigator.language ? navigator.language : resolved.locale];
      return {
        op: 'report',
        timeZone: resolved.timeZone,
        locale: resolved.locale,
        languages,
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
      };
    }

    /** One detail row of the notice. */
    function Detail(props) {
      return React.createElement(
        'div',
        { className: 'bnh-detail' },
        React.createElement('dt', { className: 'bnh-detail-label' }, props.label),
        React.createElement('dd', { className: 'bnh-detail-value' }, props.value),
      );
    }

    /**
     * The frame-wide notice. Renders nothing unless the Host reports a ban.
     * @returns The notice element, or null.
     */
    function BanNotice(props) {
      const [snapshot, setSnapshot] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const translate = props.translate;

      React.useEffect(() => {
        let alive = true;
        let timer;
        let reported = false;

        const poll = async () => {
          try {
            if (!reported) {
              const posted = await fetch(ROUTE, {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(fingerprint()),
              });
              if (posted.ok) reported = true;
            }
            const response = await fetch(ROUTE, { credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
            const body = await response.json();
            if (alive) setSnapshot(body);
          } catch {
            // A transient transport failure keeps the last known state; the
            // next poll retries. No ban is invented from a failed read.
          } finally {
            if (alive) timer = window.setTimeout(poll, POLL_MS);
          }
        };

        void poll();
        return () => {
          alive = false;
          window.clearTimeout(timer);
        };
      }, []);

      if (snapshot === null || snapshot.banned !== true) return null;

      const ban = snapshot.ban ?? {};
      const score = snapshot.score ?? {};
      const region = [score.timeZone, score.language].filter(
        (part) => typeof part === 'string' && part.length > 0,
      );

      const exitPreview = async () => {
        setBusy(true);
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ op: 'reset' }),
          });
          if (response.ok) setSnapshot(await response.json());
        } catch {
          // The next poll retries; the preview simply stays for now.
        } finally {
          setBusy(false);
        }
      };

      return React.createElement(
        'div',
        { className: 'bnh-screen' },
        React.createElement(
          'div',
          {
            className: 'bnh-panel',
            role: 'alertdialog',
            'aria-modal': 'true',
            'aria-labelledby': 'bnh-title',
          },
          React.createElement(
            'div',
            { className: 'bnh-mark', 'aria-hidden': 'true' },
            React.createElement(
              'svg',
              { viewBox: '0 0 48 48', width: '44', height: '44', fill: 'none' },
              React.createElement('circle', {
                cx: '24',
                cy: '24',
                r: '15',
                stroke: 'currentColor',
                strokeWidth: '2.5',
              }),
              React.createElement('path', {
                d: 'M10 38 38 10',
                stroke: 'currentColor',
                strokeWidth: '3',
                strokeLinecap: 'round',
              }),
            ),
          ),
          React.createElement('h1', { id: 'bnh-title', className: 'bnh-title' }, translate('title')),
          React.createElement('p', { className: 'bnh-lead' }, translate('lead')),
          ban.dryRun === true
            ? React.createElement('p', { className: 'bnh-preview' }, translate('preview'))
            : null,
          React.createElement(
            'dl',
            { className: 'bnh-details' },
            React.createElement(Detail, {
              label: translate('regionLabel'),
              value: region.length > 0 ? region.join(' · ') : translate('unknown'),
            }),
            React.createElement(Detail, { label: translate('timeLabel'), value: formatTime(ban.at) }),
            React.createElement(Detail, { label: translate('scoreLabel'), value: formatScore(score.value) }),
            React.createElement(Detail, {
              label: translate('sourceLabel'),
              value: sourceLabel(translate, ban.source),
            }),
          ),
          React.createElement('p', { className: 'bnh-note' }, translate('note')),
          React.createElement(
            'div',
            { className: 'bnh-footer' },
            React.createElement('code', { className: 'bnh-code' }, translate('error')),
            ban.dryRun === true
              ? React.createElement(
                  'button',
                  { type: 'button', className: 'bnh-button', disabled: busy, onClick: () => void exitPreview() },
                  translate('previewReset'),
                )
              : null,
          ),
        ),
      );
    }

    /** Notice styles; only `--dsw-alias-*` tokens are referenced. */
    const CSS = `
.bnh-screen {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  pointer-events: auto;
  overflow-y: auto;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.bnh-panel {
  width: min(560px, 100%);
  font-size: 14px;
  line-height: 1.6;
}
.bnh-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-bottom: 20px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-state-error-primary);
}
.bnh-title {
  margin: 0 0 12px;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.bnh-lead {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  max-width: 52ch;
}
.bnh-preview {
  display: inline-block;
  margin: 14px 0 0;
  padding: 3px 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bnh-details {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 18px;
  margin: 24px 0 0;
  padding: 16px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-size: 13px;
}
.bnh-detail { display: contents; }
.bnh-detail-label { color: var(--dsw-alias-label-secondary); }
.bnh-detail-value { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.bnh-note {
  margin: 16px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bnh-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
}
.bnh-code {
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  letter-spacing: 0.04em;
}
.bnh-button {
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.bnh-button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.bnh-button:disabled { cursor: default; opacity: 0.6; }
`;

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        let translate;
        try {
          ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'dsh-ban-hammer: dictionaries');
          translate = translateWith(ctx.locale.bind(NS));
        } catch {
          translate = translateWith((key) => key);
        }

        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.plugin = 'dsh-ban-hammer';
          tag.textContent = CSS;
          document.head.append(tag);
          return () => tag.remove();
        }, 'dsh-ban-hammer: styles');

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'dsh-ban-hammer', order: 95, locale: NS }, () =>
            React.createElement(BanNotice, { translate }),
          ),
        );
      },
    };
  },
});
