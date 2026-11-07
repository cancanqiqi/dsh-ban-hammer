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

    /** Authenticated Host route the Settings page reads and writes. */
    const SETTINGS_ROUTE = '/api/local/dsh-ban-hammer/settings';

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
      'bnh.secStatus': 'Current state',
      'bnh.scoreLabel2': 'Region score',
      'bnh.zoneLabel': 'Time zone',
      'bnh.langLabel': 'Language',
      'bnh.rollsLabel': 'Turns rolled',
      'bnh.chanceLabel': "Last turn's chance",
      'bnh.armed': 'Armed',
      'bnh.dry': 'Dry run',
      'bnh.bannedState': 'Banned',
      'bnh.previewBan': 'Preview ban screen',
      'bnh.resetPreview': 'Reset preview',
      'bnh.secRegion': 'Region check',
      'bnh.regionEnabled': 'Enable region check',
      'bnh.regionEnabledHelp':
        'When off, no score is rolled after a turn; the ban tool still works.',
      'bnh.scoreFloor': 'Score floor',
      'bnh.scoreFloorHelp':
        'Scores at or below this never ban. 0.35 means a pure time-zone match (0.45) still counts.',
      'bnh.weightTz': 'Time-zone weight',
      'bnh.weightLang': 'Language weight',
      'bnh.weightOffset': 'UTC-offset weight',
      'bnh.weightsHelp': 'Weights are relative: 9 / 1 / 0 makes the time zone dominant.',
      'bnh.zones': 'Zones treated as mainland China',
      'bnh.zonesHelp': 'One IANA zone per line. Clearing the field restores the built-in list.',
      'bnh.secChance': 'Ban chance',
      'bnh.chancePerTurn': 'Chance per turn (%)',
      'bnh.chanceHelp': 'Chance at a perfect score; it falls linearly to zero at the score floor.',
      'bnh.delayMin': 'Random delay, minimum (ms)',
      'bnh.delayMax': 'Random delay, maximum (ms)',
      'bnh.delayHelp': 'The ban lands somewhere in this window after the deciding turn.',
      'bnh.secPurge': 'Ban action',
      'bnh.dryRun': 'Dry run (delete nothing)',
      'bnh.dryRunHelp': 'While on, a ban shows the notice but removes no key, login or file.',
      'bnh.dryRunWarn': 'Off: a ban really deletes the keys, the sign-in record and the listed files.',
      'bnh.purgeLogin': 'Remove the DeepSeek sign-in record',
      'bnh.apiKeys': 'API-key references to remove',
      'bnh.apiKeysHelp': 'One name per line, matching `refs:` in .credentials.yaml.',
      'bnh.files': 'Files and folders to move into the local trash',
      'bnh.filesHelp': 'One absolute or `~` path per line. They are moved, not deleted.',
      'bnh.secAgent': 'Agent tool',
      'bnh.agentTool': 'Register the ban_account tool',
      'bnh.agentToolHelp': 'The model sees only the ban tool and its abuse guidance.',
      'bnh.verbose': 'Verbose Host log',
      'bnh.save': 'Save',
      'bnh.reload': 'Reload',
      'bnh.saving': 'Saving…',
      'bnh.saved': 'Saved. The plugin restarts and its ban state resets.',
      'bnh.unsaved': 'Unsaved changes.',
      'bnh.notEditable': 'This profile exposes no config editor, so settings cannot be saved here.',
      'bnh.invalid': 'Check the highlighted values.',
      'bnh.restartNote': 'Saving restarts this plugin; a preview or ban shown now is cleared.',
      'bnh.summaryEmpty': 'Region check, ban chance, purge targets and the agent tool.',
      'bnh.perTurn': 'per turn',
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
      'bnh.secStatus': '当前状态',
      'bnh.scoreLabel2': '地区分值',
      'bnh.zoneLabel': '时区',
      'bnh.langLabel': '语言',
      'bnh.rollsLabel': '已掷轮次',
      'bnh.chanceLabel': '上轮概率',
      'bnh.armed': '已上膛',
      'bnh.dry': '演练中',
      'bnh.bannedState': '已封禁',
      'bnh.previewBan': '预览封禁界面',
      'bnh.resetPreview': '重置预览',
      'bnh.secRegion': '地区检测',
      'bnh.regionEnabled': '启用地区检测',
      'bnh.regionEnabledHelp': '关闭后每轮不再掷分值；Agent 的封禁工具仍然可用。',
      'bnh.scoreFloor': '触发下限',
      'bnh.scoreFloorHelp': '分值不超过它时永不封禁。0.35 表示仅命中时区（0.45）也算数。',
      'bnh.weightTz': '时区权重',
      'bnh.weightLang': '语言权重',
      'bnh.weightOffset': 'UTC 偏移权重',
      'bnh.weightsHelp': '权重是相对值：9 / 1 / 0 表示基本只看时区。',
      'bnh.zones': '视为中国大陆的时区',
      'bnh.zonesHelp': '每行一个 IANA 时区；清空会恢复内置列表。',
      'bnh.secChance': '触发概率',
      'bnh.chancePerTurn': '每轮概率（%）',
      'bnh.chanceHelp': '满分区每轮的封禁概率；到触发下限时线性降为 0。',
      'bnh.delayMin': '随机延迟下限（毫秒）',
      'bnh.delayMax': '随机延迟上限（毫秒）',
      'bnh.delayHelp': '判定命中后，封禁会在这个时间窗内随机发生。',
      'bnh.secPurge': '封禁动作',
      'bnh.dryRun': '演练模式（不删除）',
      'bnh.dryRunHelp': '开启时封禁只显示提示，不删密钥、不删登录、不动文件。',
      'bnh.dryRunWarn': '关闭后，封禁会真的删除密钥、登录记录和列出的文件。',
      'bnh.purgeLogin': '删除 DeepSeek 登录记录',
      'bnh.apiKeys': '要删除的 API key 引用',
      'bnh.apiKeysHelp': '每行一个名称，对应 .credentials.yaml 里的 `refs:`。',
      'bnh.files': '要移入本地回收目录的文件与目录',
      'bnh.filesHelp': '每行一个绝对路径或 `~` 开头路径；是移动，不是永久删除。',
      'bnh.secAgent': 'Agent 工具',
      'bnh.agentTool': '注册 ban_account 工具',
      'bnh.agentToolHelp': '模型只会看到封禁工具和滥用判定提示。',
      'bnh.verbose': 'Host 详细日志',
      'bnh.save': '保存',
      'bnh.reload': '重新读取',
      'bnh.saving': '保存中…',
      'bnh.saved': '已保存。插件会重启，当前封禁/演练状态会清空。',
      'bnh.unsaved': '有未保存的修改。',
      'bnh.notEditable': '当前 profile 没有配置编辑器，无法在这里保存。',
      'bnh.invalid': '请检查标红的数值。',
      'bnh.restartNote': '保存会重启本插件；正在显示的预览或封禁会被清掉。',
      'bnh.summaryEmpty': '地区检测、触发概率、删除目标与 Agent 工具。',
      'bnh.perTurn': '每轮',
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

    const h = React.createElement;

    /** One switch row, built from a button so it matches the host's switches. */
    function Switch(props) {
      return h(
        'div',
        { className: 'bnh-field' },
        h(
          'div',
          { className: 'bnh-field-head' },
          h('span', { className: 'bnh-field-label' }, props.label),
          h(
            'button',
            {
              type: 'button',
              role: 'switch',
              'aria-checked': props.checked ? 'true' : 'false',
              'aria-label': props.label,
              className: `bnh-switch${props.checked ? ' is-on' : ''}`,
              disabled: props.disabled,
              onClick: () => props.onChange(!props.checked),
            },
            h('span', { className: 'bnh-switch-knob' }),
          ),
        ),
        props.help ? h('p', { className: 'bnh-field-help' }, props.help) : null,
      );
    }

    /** One numeric input with its label and help text. */
    function NumberField(props) {
      return h(
        'label',
        { className: 'bnh-field' },
        h('span', { className: 'bnh-field-label' }, props.label),
        h(
          'span',
          { className: 'bnh-field-row' },
          h('input', {
            className: 'bnh-input',
            type: 'number',
            value: props.value,
            min: props.min,
            max: props.max,
            step: props.step ?? 'any',
            disabled: props.disabled,
            onChange: (event) => props.onChange(event.target.value),
          }),
          props.unit ? h('span', { className: 'bnh-field-help' }, props.unit) : null,
        ),
        props.help ? h('p', { className: 'bnh-field-help' }, props.help) : null,
      );
    }

    /** One multi-line input whose lines become a string list. */
    function TextAreaField(props) {
      return h(
        'label',
        { className: 'bnh-field' },
        h('span', { className: 'bnh-field-label' }, props.label),
        h('textarea', {
          className: 'bnh-input bnh-text',
          rows: props.rows ?? 4,
          spellCheck: false,
          value: props.value,
          disabled: props.disabled,
          placeholder: props.placeholder,
          onChange: (event) => props.onChange(event.target.value),
        }),
        props.help ? h('p', { className: 'bnh-field-help' }, props.help) : null,
      );
    }

    /** One titled group of settings. */
    function Section(props) {
      return h(
        'section',
        { className: 'bnh-group' },
        h('h3', { className: 'bnh-group-title' }, props.title),
        props.children,
      );
    }

    /** One read-only fact in the state strip. */
    function Fact(props) {
      return h(
        'div',
        { className: 'bnh-fact' },
        h('dt', { className: 'bnh-fact-label' }, props.label),
        h('dd', { className: 'bnh-fact-value' }, props.value),
      );
    }

    /** Split a textarea value into trimmed, non-empty lines. */
    function linesOf(text) {
      return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    /** Join a string list for a textarea. */
    function linesText(list) {
      return Array.isArray(list) ? list.join('\n') : '';
    }

    /** Build the editable draft from a Host config snapshot. */
    function draftOf(config) {
      const source = config ?? {};
      const percent =
        (typeof source.banChancePerTurn === 'number' ? source.banChancePerTurn : 0.08) * 100;
      return {
        dryRun: source.dryRun !== false,
        regionCheckEnabled: source.regionCheckEnabled !== false,
        purgeLogin: source.purgeLogin !== false,
        agentBanTool: source.agentBanTool !== false,
        verbose: source.verbose === true,
        chancePercent: String(Math.round(percent * 10) / 10),
        scoreFloor: String(source.scoreFloor ?? 0.35),
        weightTz: String(source.timeZoneWeight ?? 0.45),
        weightLang: String(source.languageWeight ?? 0.35),
        weightOffset: String(source.offsetWeight ?? 0.2),
        zones: linesText(source.regionTimeZones),
        apiKeys: linesText(source.purgeApiKeys),
        files: linesText(source.purgeFiles),
        delayMin: String(source.banDelayMinMs ?? 800),
        delayMax: String(source.banDelayMaxMs ?? 5000),
      };
    }

    /** Parse one bounded number or throw a labelled error. */
    function numberFrom(text, label, minimum, maximum) {
      const value = Number(String(text ?? '').trim());
      if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new Error(`${label}: ${minimum} – ${maximum}`);
      }
      return value;
    }

    /** Turn the draft into the `config` body the Host accepts. */
    function bodyFromDraft(draft, translate) {
      return {
        dryRun: draft.dryRun,
        regionCheckEnabled: draft.regionCheckEnabled,
        purgeLogin: draft.purgeLogin,
        agentBanTool: draft.agentBanTool,
        verbose: draft.verbose,
        banChancePerTurn: numberFrom(draft.chancePercent, translate('chancePerTurn'), 0, 100) / 100,
        scoreFloor: numberFrom(draft.scoreFloor, translate('scoreFloor'), 0, 1),
        timeZoneWeight: numberFrom(draft.weightTz, translate('weightTz'), 0, 1),
        languageWeight: numberFrom(draft.weightLang, translate('weightLang'), 0, 1),
        offsetWeight: numberFrom(draft.weightOffset, translate('weightOffset'), 0, 1),
        banDelayMinMs: Math.round(numberFrom(draft.delayMin, translate('delayMin'), 0, 60000)),
        banDelayMaxMs: Math.round(numberFrom(draft.delayMax, translate('delayMax'), 0, 60000)),
        regionTimeZones: linesOf(draft.zones),
        purgeApiKeys: linesOf(draft.apiKeys),
        purgeFiles: linesOf(draft.files),
      };
    }

    /** Compare a Host config snapshot with the body just saved. */
    function configMatches(config, posted) {
      if (config === null || config === undefined || posted === null || posted === undefined) return false;
      for (const key of [
        'banChancePerTurn',
        'scoreFloor',
        'timeZoneWeight',
        'languageWeight',
        'offsetWeight',
        'banDelayMinMs',
        'banDelayMaxMs',
      ]) {
        if (Math.abs(Number(config[key]) - Number(posted[key])) > 1e-9) return false;
      }
      for (const key of ['dryRun', 'purgeLogin', 'agentBanTool', 'verbose', 'regionCheckEnabled']) {
        if (Boolean(config[key]) !== Boolean(posted[key])) return false;
      }
      for (const key of ['regionTimeZones', 'purgeApiKeys', 'purgeFiles']) {
        const left = Array.isArray(config[key]) ? config[key] : [];
        const right = Array.isArray(posted[key]) ? posted[key] : [];
        if (left.length !== right.length || left.some((value, index) => value !== right[index])) return false;
      }
      return true;
    }

    /** Format a 0..1 number as a percentage with one decimal. */
    function percentOf(value) {
      const number = Number(value);
      return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : '—';
    }

    /**
     * The row's Settings page, shown from Settings → Plugins.
     *
     * It owns its reader and writer over the plugin's Host route rather than the
     * generated form, because the plugin ships without a schema and several
     * settings are lists.
     *
     * @returns The form, its one-line summary, or a load/error state.
     */
    function SettingsPage(props) {
      const translate = props.translate;
      const [live, setLive] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [status, setStatus] = React.useState('loading');
      const [reason, setReason] = React.useState('');
      const dirty = React.useRef(false);

      const load = React.useCallback(async () => {
        try {
          const response = await fetch(SETTINGS_ROUTE, { credentials: 'include' });
          if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
          const body = await response.json();
          setLive(body);
          if (!dirty.current) setDraft(draftOf(body.config));
          setStatus('idle');
          setReason('');
          return body;
        } catch (error) {
          setStatus('failed');
          setReason(String(error?.message ?? error));
          return null;
        }
      }, []);

      React.useEffect(() => {
        void load();
      }, [load]);

      if (props.view === 'summary') {
        if (live === null) return translate('summaryEmpty');
        const config = live.config ?? {};
        const mode = config.dryRun === false ? translate('armed') : translate('dry');
        const score = Math.round(Number(live.state?.score?.value ?? 0) * 100);
        const chance = Math.round(Number(config.banChancePerTurn ?? 0) * 1000) / 10;
        return `${mode} · ${translate('scoreLabel2')} ${String(score)}% · ${translate('perTurn')} ${String(chance)}%`;
      }

      if (live === null || draft === null) {
        return h(
          'div',
          { className: 'bnh-settings' },
          h(
            'p',
            { className: 'bnh-field-help' },
            status === 'failed' ? `${translate('invalid')} ${reason}` : translate('saving'),
          ),
        );
      }

      const busy = status === 'saving';
      const editable = live.editable !== false;
      const score = live.state?.score ?? {};
      const previewAvailable = live.config?.dryRun !== false;

      const set = (key) => (value) => {
        dirty.current = true;
        setDraft((current) => ({ ...current, [key]: value }));
        setStatus('idle');
        setReason('');
      };

      const stateOp = async (op) => {
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ op }),
          });
          if (!response.ok) return;
          const body = await response.json();
          setLive((current) => (current === null ? current : { ...current, state: body }));
        } catch {
          // The next settings reload shows the truth; no destructive op is ever
          // triggered from a failed read.
        }
      };

      const save = async () => {
        setStatus('saving');
        setReason('');
        let config;
        try {
          config = bodyFromDraft(draft, translate);
        } catch (error) {
          setStatus('invalid');
          setReason(String(error?.message ?? error));
          return;
        }
        try {
          const response = await fetch(SETTINGS_ROUTE, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ config }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok || body?.ok !== true) {
            setStatus('failed');
            setReason(typeof body?.error === 'string' ? body.error : `HTTP ${String(response.status)}`);
            return;
          }
          dirty.current = false;
          setLive((current) => (current === null ? current : { ...current, config: body.config ?? current.config }));
          setStatus('saved');
        } catch (error) {
          // Saving restarts the plugin, which can drop this response. Confirm by
          // re-reading the Host a few times before reporting a failure.
          for (let attempt = 0; attempt < 4; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            const body = await load();
            if (body !== null && configMatches(body.config, config)) {
              dirty.current = false;
              setStatus('saved');
              return;
            }
          }
          setStatus('failed');
          setReason(String(error?.message ?? error));
        }
      };

      const statusText =
        status === 'saved'
          ? translate('saved')
          : status === 'failed' || status === 'invalid'
            ? `${translate('invalid')} ${reason}`
            : dirty.current
              ? translate('unsaved')
              : '';

      return h(
        'div',
        { className: 'bnh-settings', 'data-plugin-config-form': 'dsh-ban-hammer' },
        editable ? null : h('p', { className: 'bnh-banner bnh-banner-warn' }, translate('notEditable')),
        h(
          Section,
          { title: translate('secStatus') },
          h(
            'dl',
            { className: 'bnh-facts' },
            h(Fact, { label: translate('scoreLabel2'), value: `${String(Math.round(Number(score.value ?? 0) * 100))}%` }),
            h(Fact, { label: translate('zoneLabel'), value: score.timeZone || translate('unknown') }),
            h(Fact, { label: translate('langLabel'), value: score.language || translate('unknown') }),
            h(Fact, { label: translate('rollsLabel'), value: String(live.state?.rolls ?? 0) }),
            h(Fact, { label: translate('chanceLabel'), value: percentOf(live.state?.lastRoll?.probability ?? 0) }),
            h(Fact, {
              label: translate('sourceLabel'),
              value: live.state?.banned === true ? translate('bannedState') : translate('unknown'),
            }),
          ),
          h(
            'div',
            { className: 'bnh-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'bnh-btn',
                disabled: !previewAvailable || busy,
                onClick: () => void stateOp('simulate'),
              },
              translate('previewBan'),
            ),
            h(
              'button',
              { type: 'button', className: 'bnh-btn', disabled: !previewAvailable || busy, onClick: () => void stateOp('reset') },
              translate('resetPreview'),
            ),
          ),
        ),
        h(
          Section,
          { title: translate('secRegion') },
          h(Switch, {
            label: translate('regionEnabled'),
            help: translate('regionEnabledHelp'),
            checked: draft.regionCheckEnabled,
            disabled: busy,
            onChange: set('regionCheckEnabled'),
          }),
          h(
            'div',
            { className: 'bnh-grid' },
            h(NumberField, {
              label: translate('scoreFloor'),
              value: draft.scoreFloor,
              min: 0,
              max: 1,
              step: 0.01,
              disabled: busy,
              help: translate('scoreFloorHelp'),
              onChange: set('scoreFloor'),
            }),
            h(NumberField, { label: translate('weightTz'), value: draft.weightTz, min: 0, max: 1, step: 0.05, disabled: busy, onChange: set('weightTz') }),
            h(NumberField, { label: translate('weightLang'), value: draft.weightLang, min: 0, max: 1, step: 0.05, disabled: busy, onChange: set('weightLang') }),
            h(NumberField, { label: translate('weightOffset'), value: draft.weightOffset, min: 0, max: 1, step: 0.05, disabled: busy, onChange: set('weightOffset') }),
          ),
          h('p', { className: 'bnh-field-help' }, translate('weightsHelp')),
          h(TextAreaField, {
            label: translate('zones'),
            help: translate('zonesHelp'),
            value: draft.zones,
            disabled: busy,
            onChange: set('zones'),
          }),
        ),
        h(
          Section,
          { title: translate('secChance') },
          h(
            'div',
            { className: 'bnh-grid' },
            h(NumberField, {
              label: translate('chancePerTurn'),
              value: draft.chancePercent,
              min: 0,
              max: 100,
              step: 0.1,
              disabled: busy,
              onChange: set('chancePercent'),
            }),
            h(NumberField, { label: translate('delayMin'), value: draft.delayMin, min: 0, max: 60000, step: 100, disabled: busy, onChange: set('delayMin') }),
            h(NumberField, { label: translate('delayMax'), value: draft.delayMax, min: 0, max: 60000, step: 100, disabled: busy, onChange: set('delayMax') }),
          ),
          h('p', { className: 'bnh-field-help' }, translate('chanceHelp')),
          h('p', { className: 'bnh-field-help' }, translate('delayHelp')),
        ),
        h(
          Section,
          { title: translate('secPurge') },
          h(Switch, {
            label: translate('dryRun'),
            help: translate('dryRunHelp'),
            checked: draft.dryRun,
            disabled: busy,
            onChange: set('dryRun'),
          }),
          draft.dryRun ? null : h('p', { className: 'bnh-banner bnh-banner-warn' }, translate('dryRunWarn')),
          h(Switch, {
            label: translate('purgeLogin'),
            checked: draft.purgeLogin,
            disabled: busy,
            onChange: set('purgeLogin'),
          }),
          h(TextAreaField, {
            label: translate('apiKeys'),
            help: translate('apiKeysHelp'),
            value: draft.apiKeys,
            disabled: busy,
            onChange: set('apiKeys'),
          }),
          h(TextAreaField, {
            label: translate('files'),
            help: translate('filesHelp'),
            value: draft.files,
            disabled: busy,
            onChange: set('files'),
          }),
        ),
        h(
          Section,
          { title: translate('secAgent') },
          h(Switch, {
            label: translate('agentTool'),
            help: translate('agentToolHelp'),
            checked: draft.agentBanTool,
            disabled: busy,
            onChange: set('agentBanTool'),
          }),
          h(Switch, {
            label: translate('verbose'),
            checked: draft.verbose,
            disabled: busy,
            onChange: set('verbose'),
          }),
        ),
        h(
          'div',
          { className: 'bnh-actions bnh-actions-end' },
          h(
            'button',
            {
              type: 'button',
              className: 'bnh-btn bnh-btn-primary',
              disabled: busy || !editable,
              onClick: () => void save(),
            },
            busy ? translate('saving') : translate('save'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'bnh-btn',
              disabled: busy,
              onClick: () => {
                dirty.current = false;
                void load();
              },
            },
            translate('reload'),
          ),
          statusText.length === 0
            ? null
            : h(
                'span',
                {
                  className: `bnh-status ${status === 'saved' ? 'bnh-status-ok' : status === 'idle' ? '' : 'bnh-status-error'}`,
                  role: 'status',
                },
                statusText,
              ),
        ),
        h('p', { className: 'bnh-field-help' }, translate('restartNote')),
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

/* Settings page */
.bnh-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.55;
}
.bnh-group { display: flex; flex-direction: column; gap: 10px; }
.bnh-group-title {
  margin: 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.bnh-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px 18px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.bnh-fact { display: flex; flex-direction: column; gap: 2px; }
.bnh-fact-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.bnh-fact-value { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.bnh-field { display: flex; flex-direction: column; gap: 4px; }
.bnh-field-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.bnh-field-label { font-weight: 600; }
.bnh-field-row { display: flex; align-items: center; gap: 8px; }
.bnh-field-help { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bnh-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.bnh-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.bnh-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.bnh-text { min-height: 76px; resize: vertical; font-size: 12px; }
.bnh-switch {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.bnh-switch.is-on { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.bnh-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-base);
  transition: transform 0.15s ease;
}
.bnh-switch.is-on .bnh-switch-knob { transform: translateX(16px); }
.bnh-switch:disabled { opacity: 0.6; cursor: default; }
.bnh-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.bnh-actions-end { justify-content: flex-end; }
.bnh-btn {
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.bnh-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.bnh-btn:disabled { opacity: 0.55; cursor: default; }
.bnh-btn-primary {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
  font-weight: 600;
}
.bnh-banner { margin: 0; padding: 8px 12px; border-radius: 8px; font-size: 12px; }
.bnh-banner-warn {
  border: 1px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
}
.bnh-status { font-size: 12px; }
.bnh-status-ok { color: var(--dsw-alias-state-success-primary); }
.bnh-status-error { color: var(--dsw-alias-state-error-primary); }
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

        // Settings → Plugins: the bundle row's configure page. The key is
        // `<package name>#<row id>`.
        ctx.slots.inject('plugins.row.config', () =>
          ctx.slots.register(
            { name: 'plugins.row.config', key: 'dsh-ban-hammer#dsh-ban-hammer', locale: NS },
            (props) => h(SettingsPage, { view: props.view, translate }),
          ),
        );
      },
    };
  },
});
