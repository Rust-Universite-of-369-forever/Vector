# Vector — спокойное приложение для саморазвития

Мягкий интерфейс + авторизация через Firebase.

## Быстрый старт

```bash
npm install
npm run dev
```

## Настройка Firebase (обязательно)

### 1. Конфиг
Открой `src/firebase.js` и вставь свой конфиг из Firebase Console  
(Project Settings → Your apps).

### 2. Authentication
В Firebase Console → **Authentication** → **Sign-in method**:

- Включи **Email/Password**
- Включи **Google** (укажи support email)

### 3. Авторизованные домены
Authentication → Settings → Authorized domains  
Добавь `localhost` (обычно уже есть) и позже домен Vercel.

## Что работает сейчас

- Вход и регистрация (email + Google)
- Защита приложения — без входа ничего не видно
- Данные (цели, привычки, дневник) сохраняются в localStorage  
  **отдельно для каждого пользователя** (привязаны к uid)
- Выход из аккаунта

## Следующий шаг (по желанию)

Перенести данные из localStorage в **Firestore**,  
чтобы они синхронизировались между устройствами.

## Деплой на Vercel

```bash
npm run build
```

Потом подключи репозиторий к Vercel — он сам определит Vite.

Не забудь добавить домен Vercel в Authorized domains Firebase.
