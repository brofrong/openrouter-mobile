# OpenRouter Mobile

Фан-проект для себя: удобный UI вокруг [OpenRouter](https://openrouter.ai), чтобы пользоваться чатом с телефона, браузера и не возиться с чужим интерфейсом.

Это не продукт и не публичный сервис. Цель — личный клиент: сессии, стриминг ответов, простой экран. Ключ OpenRouter остаётся на сервере.

Клиент — Expo + Tamagui (iOS / Android / web). Сервер — Bun + Effect, чат идёт через OpenRouter API. Картинки / видео / речь пока заглушки.

## Стек

| | |
| --- | --- |
| Клиент | Expo SDK 57, Tamagui v5 |
| API | Effect RPC (`/rpc`, WebSocket `/rpc/ws`) |
| Сервер | Bun, Effect v4 |
| Auth | Better Auth (email/password или OIDC, если задан) |
| БД | PostgreSQL, Drizzle |
| Файлы | MinIO (S3). Клиент ходит только на `{BASE_URL}/media/...` |

Пакеты `@openrouter-mobile/*`: `apps/mobile`, `apps/server`, `packages/domain`, `packages/rpc`, `packages/db`.

## Хостинг

Главный способ — **Docker Compose** (`docker-compose.prod.yml`): Postgres + сервер с веб-клиентом в одном образе. TLS — Caddy (`deploy/Caddyfile`) в внешней сети `proxy`.

```bash
cp .env.example .env
# POSTGRES_PASSWORD, BASE_URL=https://$DOMAIN, DOMAIN, OPENROUTER_API_KEY, ACME_EMAIL
docker network create proxy   # если ещё нет
docker compose -f docker-compose.prod.yml up -d
```

Образ `ghcr.io/brofrong/openrouter-mobile/server` (тег `IMAGE_TAG`, по умолчанию `latest`). Сервер слушает `3000` внутри сети; наружу его отдаёт Caddy.

## Разработка

Локально Postgres и MinIO — обычный `docker compose up -d`. Сервер и Expo — через bun.

```bash
cp .env.example .env   # OPENROUTER_API_KEY, BASE_URL
docker compose up -d
bun install
bun run --filter @openrouter-mobile/server start
bun run --filter @openrouter-mobile/mobile web
```

`bun run dev` поднимает сервер с `--watch` и Expo web. Оба читают корневой `.env`. Натив: `bun run --filter @openrouter-mobile/mobile start`.

Если порт `3000` занят — другой `PORT` и тот же origin в `BASE_URL`. Auth (`/api/auth/*`), RPC и WebSocket считаются от него.

## Python sandbox

Сервис `sandbox` в compose (порт `8090`) — готовый образ `ghcr.io/brofrong/python-mcp-sandbox:sha256-f9de48d74ff93146c5278f6e2aef9e42444a9aa05212bbcac2b4f674998e748c`. Бэкенд ходит в MCP Streamable HTTP `/mcp` (Bearer `SANDBOX_SECRET`). Модели отдаётся tool `execute` (`{ code }`); `session_id` подставляет сервер.

## DuckDuckGo MCP

Сервис `duckduckgo` в compose (порт `8000`, образ [`mcp/duckduckgo`](https://hub.docker.com/r/mcp/duckduckgo)). Streamable HTTP на `/mcp`. Сервер подхватывает tools `search` и `fetch_content` и отдаёт их модели вместе с `generate_video` / sandbox `execute`.

Локально: `MCP_URL=http://localhost:8000/mcp`. В Docker: `http://duckduckgo:8000/mcp`. Без `MCP_URL` MCP выключен.

## Переменные

Скопировать `.env.example` в `.env`.

| Переменная | Зачем |
| --- | --- |
| `DATABASE_URL` | Postgres. Локально: `postgres://openrouter:openrouter@localhost:5432/openrouter` |
| `PORT` | Порт HTTP, по умолчанию `3000` |
| `OPENROUTER_API_KEY` | Только на сервере. Без ключа чат не отправится |
| `OPENROUTER_MODEL` | Модель чата, по умолчанию `openai/gpt-4o-mini` |
| `BASE_URL` | Публичный origin (auth, `/rpc`, `/rpc/ws`) |
| `EXPO_PUBLIC_BASE_URL` | Тот же origin для клиента; если пусто, берётся `BASE_URL` |
| `AUTH_DISABLE_SIGNUP` | Запретить регистрацию по email/password |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | Опционально: тогда вход только через OIDC |
| `BETTER_AUTH_SECRET` | Опционально; иначе секрет пишется в `kv` |
| `S3_ENDPOINT` | MinIO/S3 API. Локально `http://localhost:9000`, в Docker `http://minio:9000` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Ключи MinIO (по умолчанию `openrouter` / `openrouter`) |
| `S3_BUCKET` | Бакет, по умолчанию `media` |
| `S3_REGION` | Регион S3, по умолчанию `us-east-1` |
| `SANDBOX_URL` | Python sandbox. Локально `http://localhost:8090` |
| `SANDBOX_SECRET` | Bearer-секрет контейнера sandbox |
| `MCP_URL` | Streamable HTTP MCP, например DuckDuckGo. Локально `http://localhost:8000/mcp` |
| `MCP_SECRET` | Опциональный Bearer для MCP. Для DuckDuckGo не нужен |

Для деплоя ещё `POSTGRES_*`, `DOMAIN`, `ACME_EMAIL`, `IMAGE_TAG`, `WEB_DIR` — см. `.env.example`.

## Команды

```bash
bun run check          # Biome
bun run check:fix
bun run check-types
bun run db:migrate     # на старте сервера тоже накатывается
bun run release        # semver-тег; по `v*` собираются образ и APK
```

## Лицензия

[MIT](LICENSE)
