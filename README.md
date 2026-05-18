# Суфлёр — AI-ассистент для звонков на итальянском

Помогает русскоязычным людям вести телефонные разговоры по-итальянски в реальном времени.

**Как это работает:**
1. Описываете цель звонка — AI уточняет детали
2. Кладёте телефон рядом с микрофоном на громкой связи
3. Суфлёр слушает собеседника и предлагает фразы для ответа
4. Читаете фразу вслух — на итальянском или транслитом русскими буквами

## Демо

**[olivehush.com](https://olivehush.com)** — работающая версия

## Быстрый старт

### Что понадобится

- Node.js 18+
- API ключ [Anthropic](https://console.anthropic.com) (Claude Haiku) — ~$5 хватит надолго
- API ключ [Deepgram](https://console.deepgram.com) — есть бесплатный tier на $200

### Установка

```bash
git clone https://github.com/b102e/sufler-lite
cd sufler-lite
npm install
```

### Настройка

```bash
cp .env.example .env.local
```

Открыть `.env.local` и вставить ключи:

```env
ANTHROPIC_API_KEY=sk-ant-...
DEEPGRAM_API_KEY=...
NEXT_PUBLIC_WS_URL=ws://localhost:3011
```

### Запуск

Нужно два терминала:

```bash
# Терминал 1 — Next.js (порт 3010)
npm run dev

# Терминал 2 — WebSocket сервер (порт 3011)
WS_PORT=3011 node ws-server/index.js
```

Или одной командой:

```bash
npm run dev:all
```

Открыть браузер: **http://localhost:3010**

## Структура проекта

```
sufler-lite/
├── app/
│   ├── page.tsx              # Стартовый экран
│   ├── call/
│   │   ├── new/page.tsx      # Подготовка звонка (онбординг)
│   │   └── [id]/page.tsx     # Активный звонок
│   └── api/
│       ├── chat/             # Онбординг-чат (Claude)
│       ├── suggest/          # Генерация реплик (Claude, streaming)
│       └── translate/        # Перевод реплик собеседника
├── ws-server/
│   └── index.js              # WebSocket сервер — Deepgram proxy
├── hooks/
│   └── useCallSession.ts     # WS-соединение, аудио-захват
├── components/
│   ├── call-prep/            # Компоненты подготовки звонка
│   ├── live-call/            # Компоненты активного звонка (legacy)
│   └── common/               # Общие компоненты
└── lib/
    ├── anthropic.ts          # Singleton Anthropic клиент
    ├── call-suggest.ts       # Типы для AI-ответов
    ├── sanitize.ts           # Защита от prompt injection
    └── rate-limit.ts         # Rate limiting
```

## Стек

| Технология | Для чего |
|-----------|---------|
| Next.js 14 (App Router) + TypeScript | Фронтенд и API |
| Tailwind CSS | Стилизация, dark theme |
| Claude Haiku (`claude-haiku-4-5`) | Онбординг, генерация реплик, переводы |
| Deepgram nova-2 | Распознавание итальянской речи в реальном времени |
| WebSocket (ws) | Стриминг аудио браузер → Deepgram |

## Деплой

Протестировано на Ubuntu 24.04 + nginx + pm2.

```bash
npm run build
pm2 start ecosystem.config.cjs
```

Nginx конфигурация для проксирования WebSocket:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3011;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

## Безопасность

- Rate limiting на всех API endpoints
- Защита от prompt injection (sanitize.ts)
- Security headers (X-Frame-Options, CSP, HSTS)
- Никакие данные не сохраняются после закрытия страницы

## Лицензия

MIT с Commons Clause — свободно для личного использования.  
Коммерческое использование требует лицензии: **contact@sufler.app**

## Автор

Vladimir Vasilenko — живу в Италии, сделал потому что сам страдал от звонков по-итальянски.
