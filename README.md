# auto-cron

Mac/Linux 両対応のジョブ実行基盤 (retry + 依存関係 + 並列処理制御 + 通知 + dashboard)。
Jenkins cron + 既存 launchd `intel.*` 系を 1 基盤に集約する。 auto-forge + auto-dev の
後継 (Phase S of `~/.claude/plans/scalable-snuggling-umbrella.md`)。

## 特徴

- **cron syntax** + DAG (`dependsOn[]`) + retry policy + 並列処理制御 (overlap policy / group mutex / global cap)
- **Mac (launchd KeepAlive) / Linux (systemd user unit)** どちらでも `bun build --compile` で arm64 native binary
- **YAML SoT** (`~/.config/auto-cron/jobs.yaml`、 chezmoi 管理、 SIGHUP reload)
- **SQLite** は run history のみ (config は YAML、 DB 消失しても再生成可)
- **severity-routed 通知**: error → Google Chat 即時 / warn → 既存 warn-digest 朝集約
- **Bun.serve dashboard** (localhost:7891、 SSE で run state を push、 Mermaid で DAG render)

## アーキテクチャ

Hexagonal 3 layer (`core ← adapters ← main`):

- `src/core/` — entity / usecase / port interface (OS 非依存、 framework 非依存)
- `src/adapters/` — config (YAML) / store (SQLite) / executor (Bun.spawn) / notifier (warn-digest + GChat) / http (dashboard)
- `src/main/` — daemon / CLI / serve entrypoint + DI 組立て

`dependency-cruiser` で境界を CI 強制。

## quick start

```bash
bun install
bun run typecheck
bun test
bun run lint:deps

# foreground 起動 (test)
bun src/main/daemon.ts

# launchd 配備 (本番)
# deploy/launchd/com.pigeonworks.auto-cron.plist を chezmoi 経由で配備
```

## CLI

```
auto-cron list                  # 登録 job 一覧 + next fire time
auto-cron status [jobname]      # 直近 run history
auto-cron run <jobname>         # 手動 trigger (--ignore-deps で依存無視)
auto-cron history <jobname>     # 全 run history
auto-cron reload                # SIGHUP daemon (jobs.yaml 再 load)
auto-cron daemon                # foreground 起動
auto-cron serve                 # dashboard 起動 (localhost:7891)
```

## YAML schema (jobs.yaml)

```yaml
global:
  maxConcurrentJobs: 4
  groupMax:
    git-heavy: 1
    network-scan: 2

jobs:
  - name: security-scans
    schedule: { cron: "0 18 * * *", timezone: "Asia/Tokyo" }
    command: [bash, -lc, "cd ~/src/.../aigis-monolith && ./jenkins/scripts/security-scans.sh"]
    env: { AIGIS_HOME: /Users/shunichi/src/.../aigis-monolith }
    retry: { maxAttempts: 3, backoffMs: [60000, 300000, 900000] }
    concurrency: { onOverlap: skip, group: network-scan }
    notify: { onFailure: immediate }

  - name: auto-implement
    schedule: { cron: "*/15 * * * *" }
    command: [bash, -lc, "cd ~/src/.../aigis-monolith && ./jenkins/scripts/auto-implement.sh"]
    concurrency: { onOverlap: skip }
    retry: { maxAttempts: 1 }
    notify: { onFailure: digest }
```

## 並列処理制御

| 層 | 設定 | 挙動 |
|---|---|---|
| per-job overlap | `concurrency.onOverlap: skip` (default) / `queue` / `killPrevious` / `concurrent` | 前回 run 中の重複発火 |
| group mutex | `concurrency.group: "name"` | 同 group は serialize |
| global cap | `global.maxConcurrentJobs: 4` | daemon-wide max |

詳細: `~/.claude/plans/scalable-snuggling-umbrella.md` の「並列処理制御」 section。

## 関連 plan

- `~/.claude/plans/scalable-snuggling-umbrella.md` — 本 project の全体設計
- auto-forge (前身、 AI agent runner): `~/src/forgejo.localhost/pigeonworks-llc/auto-forge/`
