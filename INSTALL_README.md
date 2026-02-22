# 🚀 Neue Features – Installationsanleitung

## Übersicht der neuen Dateien

```
apps/api/src/
  reports/
    reports.service.ts       ← Lohnabrechnung-Logik
    reports.controller.ts    ← API-Endpunkte
    reports.module.ts        ← Modul-Definition
  mail/
    mail.service.ts          ← E-Mail-Versand (Nodemailer)
    mail.module.ts           ← Global-Modul
  notifications/
    notifications.service.ts ← In-App + E-Mail Benachrichtigungen
    notifications.controller.ts
    notifications.module.ts
  prisma/
    add-to-schema.prisma     ← Diesen Block ins schema.prisma kopieren

apps/web/src/
  components/
    NotificationBell.tsx     ← Glocke mit Badge für den Header
  pages/
    ReportsPage.tsx          ← Lohnabrechnung Dashboard
```

---

## Schritt 1: Abhängigkeiten installieren

```bash
cd apps/api
npm install nodemailer date-fns @nestjs/schedule
npm install -D @types/nodemailer
```

---

## Schritt 2: Prisma Schema erweitern

In `apps/api/prisma/schema.prisma` folgendes hinzufügen:

```prisma
// Zum User-Modell hinzufügen:
model User {
  // ... bestehende Felder ...
  hourlyRate    Float?          // Stundenlohn für Lohnabrechnung (optional)
  isActive      Boolean @default(true)
  notifications Notification[]  // ← neu
}

// Neues Modell am Ende einfügen:
model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String
  title     String
  message   String
  read      Boolean  @default(false)
  metadata  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, read])
  @@index([userId, createdAt])
}
```

Danach Migration ausführen:
```bash
cd apps/api
npx prisma migrate dev --name add-notifications
npx prisma generate
```

---

## Schritt 3: .env Variablen hinzufügen

```env
# Mail-Konfiguration (in apps/api/.env)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=deine@email.de
MAIL_PASS=dein-app-passwort
MAIL_FROM=Zeiterfassung <noreply@firma.de>
FRONTEND_URL=http://localhost:5173
```

> **Tipp für Gmail**: Kein normales Passwort verwenden!  
> Gehe zu Google-Konto → Sicherheit → 2FA aktivieren → App-Passwörter generieren.

---

## Schritt 4: Module in app.module.ts registrieren

```typescript
// apps/api/src/app.module.ts
import { ScheduleModule } from '@nestjs/schedule';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),   // ← für Cron-Jobs
    MailModule,                  // ← Global, kein weiterer Import nötig
    NotificationsModule,
    ReportsModule,
    // ... alle anderen bestehenden Module
  ],
})
export class AppModule {}
```

---

## Schritt 5: NotificationsService in TimeEntriesService einbinden

Damit bei Statusänderungen E-Mails und Notifications ausgelöst werden,
muss der NotificationsService in deinen bestehenden TimeEntriesService:

```typescript
// apps/api/src/time-entries/time-entries.service.ts

import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TimeEntriesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,  // ← hinzufügen
  ) {}

  // In deiner updateStatus / approve Methode:
  async updateStatus(id: string, newStatus: string, changedBy: string) {
    const old = await this.prisma.timeEntry.findUniqueOrThrow({ where: { id } });

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { status: newStatus },
    });

    // ← Diese Zeile hinzufügen:
    await this.notifications.onStatusChanged({
      entryId: id,
      oldStatus: old.status,
      newStatus,
      changedBy,
    });

    return updated;
  }

  // In deiner submit Methode:
  async submit(id: string, userId: string) {
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { status: 'SUBMITTED' },
    });

    // ← Diese Zeile hinzufügen:
    await this.notifications.onEntrySubmitted({ entryId: id, workerId: userId });

    return updated;
  }
}
```

Außerdem muss NotificationsModule im TimeEntriesModule importiert werden:

```typescript
// apps/api/src/time-entries/time-entries.module.ts
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  ...
})
```

---

## Schritt 6: Frontend einbinden

### NotificationBell in den Header:
```tsx
// z.B. apps/web/src/components/Header.tsx
import { NotificationBell } from './NotificationBell';

<header>
  {/* ... andere Header-Elemente ... */}
  <NotificationBell />
</header>
```

### ReportsPage als Route:
```tsx
// apps/web/src/App.tsx oder Router
import { ReportsPage } from './pages/ReportsPage';

<Route path="/reports" element={<ReportsPage />} />
```

---

## API-Übersicht

### Reports
| Methode | URL | Beschreibung |
|---------|-----|--------------|
| GET | `/reports/team?month=1&year=2025` | Team-Monatsbericht |
| GET | `/reports/pending` | Offene Einträge |
| GET | `/reports/me/monthly?month=1&year=2025` | Eigener Monatsbericht |
| GET | `/reports/user/:id/monthly?month=1&year=2025` | Bericht eines Mitarbeiters |
| GET | `/reports/user/:id/yearly?year=2025` | Jahresübersicht |

### Notifications
| Methode | URL | Beschreibung |
|---------|-----|--------------|
| GET | `/notifications` | Eigene Benachrichtigungen |
| GET | `/notifications/unread-count` | Anzahl ungelesener |
| PATCH | `/notifications/read-all` | Alle als gelesen markieren |
| PATCH | `/notifications/:id/read` | Eine als gelesen markieren |

---

## Automatische E-Mails (Cron-Jobs)

| Zeit | Aktion |
|------|--------|
| Mo–Fr, 08:00 Uhr | Tagesübersicht offener Einträge an Manager |
| 1. jeden Monats, 09:00 Uhr | Monatsauswertung an alle Mitarbeiter |

Bei Statusänderungen und Einreichungen werden **sofort** E-Mails verschickt.
