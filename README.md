# dsh-ban-hammer

A DeepSeek Harness plugin that **simulates an “Anthropic-style” region ban**: it scores local
region signals, may ban the account while you are using it, can remove the API keys and sign-in
credential stored on the machine, moves configured files into a local trash, and gives the agent a
`ban_account` tool for conversations that turn abusive.

It is a **joke / stress-test plugin for your own installation**. It is not affiliated with
Anthropic or DeepSeek, and it is not a security boundary — anyone with local access can edit the
patch or delete the plugin. Use it only where you are allowed to break the setup.

Ships disarmed: `dryRun: true` means nothing is ever deleted until you change that.

## Features

1. **Ban action** — removes the credential references you list (API keys) and the DeepSeek
   platform sign-in record, and moves any paths in `purgeFiles` into
   `$DSH_HOME/ban-hammer-trash/<timestamp>/` with a `manifest.json` so they can be restored.
2. **Region check** — three deterministic signals (IANA time zone, system language, UTC offset) are
   scored 0–1 with no model call. The score becomes a per-turn ban probability; higher score, more
   likely a later turn trips the ban. Timing is random within a configured delay window.
3. **Agent tool** — `ban_account` is registered for the main agent with guidance to use it only
   after repeated threats, abuse or insults. The tool description deliberately does not describe
   the region check or the file purge.

While a ban is active, the client half covers the whole frame (sidebar, every conversation, the
composer) with the ban notice, so switching Sessions does not reveal a usable conversation. A
Harness restart clears the notice; deleted credentials do not come back by themselves.

## Install

From this directory, with the Harness profile you want to change:

```bash
# CLI form (links this working copy into the profile)
dsh plugin --profile web add link:"<absolute path to this directory>"
```

Or ask the Harness to install the bundle directory with `plugin_manager`, `action: install_bundle`,
`target: "<absolute path to this directory>"`.

After installation the plugin row is live. Change `dryRun` to `false` in the profile's
`cordis.patch.yml` (or in `plugins/web/cordis.patch.yml` inside `$DSH_HOME`) to arm it.

To uninstall:

```bash
dsh plugin --profile web remove dsh-ban-hammer
```

## Configuration

All fields live in the row's `config` block (`cordis.patch.yml`):

| Field | Default | Meaning |
| --- | --- | --- |
| `dryRun` | `true` | `true`: measure and preview only, never bans, never deletes. `false`: turns can ban and the tool can ban. |
| `banChancePerTurn` | `0.08` | Ban probability per finished turn at a perfect region score. Linear from `scoreFloor` to 1. |
| `scoreFloor` | `0.35` | Scores at or below this never ban. |
| `purgeApiKeys` | `["DEEPSEEK_API_KEY"]` | Names under `refs:` in `$DSH_HOME/.credentials.yaml` to remove. |
| `purgeLogin` | `true` | Remove the `deepseek-account-platform/default` sign-in grant. |
| `purgeFiles` | `[]` | Absolute or `~`-prefixed files/directories moved into the local trash on a ban. |
| `agentBanTool` | `true` | Register the model-facing `ban_account` tool (and its prompt hint). |
| `banDelayMinMs` / `banDelayMaxMs` | `800` / `5000` | Random delay between the deciding turn and the ban. |
| `verbose` | `false` | Log each turn's score and probability to the Host console. |
| `regionCheckEnabled` | `true` | Master switch for the per-turn region roll. |
| `regionTimeZones` | mainland list | IANA zones scored as mainland China. |
| `timeZoneWeight` / `languageWeight` / `offsetWeight` | `0.45` / `0.35` / `0.2` | Relative weights; only the ratio matters (`9/1/0` means time zone only). |

What a real ban removes and keeps:

- **Removed:** the `refs:` entries in `purgeApiKeys`, and (by default) the platform sign-in record
  `deepseek-account-platform/default`. `purgeFiles` entries move to the trash.
- **Kept:** `client-connection/browser-session`. Without it the page cannot reach the Host and the
  notice could never be shown. Also kept: sessions, attachments, the plugin itself. If you want the
  browser session gone too, remove it by hand after the restart.

## Settings page

Open **Settings → Plugins → Region ban hammer** to edit the common knobs without touching YAML:

- **Current state** — live region score, zone, language, turns rolled, last turn's chance, ban state;
  buttons to preview the ban screen and to reset a preview.
- **Region check** — enable/disable, score floor, the three weights, and the zone list.
- **Ban chance** — chance per turn and the random delay window.
- **Ban action** — dry run, the sign-in record toggle, the API-key reference list, and the
  files/folders to move into the local trash.
- **Agent tool** — register `ban_account`, and verbose Host logging.

Saving goes through the Harness config editor into the profile's `cordis.patch.yml`, so it survives
upgrades and stays visible in git. A save restarts the plugin (this is what makes the new values
active) and clears any ban or preview state. If the profile exposes no config editor, the page says
so and the YAML stays the source of truth.

## Region score

| Signal | Weight | 1.0 | Partial |
| --- | --- | --- | --- |
| IANA time zone | 0.45 | `Asia/Shanghai`, `Asia/Urumqi`, `Asia/Chongqing`, `Asia/Harbin`, `Asia/Kashgar`, `Asia/Beijing`, `PRC` | Hong Kong / Macau 0.15, Taipei 0.1 |
| System language | 0.35 | `zh-CN`, `zh-Hans-CN` | `zh-Hans` 0.85, bare `zh` 0.6, `zh-TW`/`zh-HK`/`zh-MO` 0.2 |
| UTC offset | 0.20 | UTC+8 | — (offset alone is 0.2 total) |

The page reports its own fingerprint (`Intl` time zone, `navigator.languages`, offset) and the Host
adds `TZ`, `LANG`/`LC_ALL`/`LANGUAGE` and the Node default locale. The union is scored, so a
Chinese-language browser on an English host still scores.

`Asia/Shanghai` + `zh-CN` scores `1.0` (0.45 + 0.35 + 0.20). `Asia/Shanghai` + `en-US` scores
`0.65`. `America/New_York` + `en-US` scores `0`.

## Preview the notice

With `dryRun: true`, the notice can be shown without deleting anything:

```bash
# list the current score and state
curl -b cookies.txt http://127.0.0.1:3080/api/local/dsh-ban-hammer/state

# show the ban screen (dry run)
curl -b cookies.txt -X POST -H 'content-type: application/json' \
  -d '{"op":"simulate"}' http://127.0.0.1:3080/api/local/dsh-ban-hammer/state

# clear it again
curl -b cookies.txt -X POST -H 'content-type: application/json' \
  -d '{"op":"reset"}' http://127.0.0.1:3080/api/local/dsh-ban-hammer/state
```

Both `simulate` and `reset` return `403` once `dryRun` is `false`, so a preview cannot be turned
into a manual ban. In the UI, a preview shows an “Exit preview” button; a real ban does not.

## Restore trashed files

```text
$DSH_HOME/ban-hammer-trash/<timestamp>/manifest.json
$DSH_HOME/ban-hammer-trash/<timestamp>/00-<name>
```

`manifest.json` records each original path and its trashed copy. Move them back to restore.

## Development

```bash
node --check index.js
node --check client.js
node --test test/region.test.mjs test/host.test.mjs
```

The tests stub the Harness services: no live session, credential or profile patch is touched.

## License

MIT. See [LICENSE](./LICENSE).
