# 📤 Export-Modul – Installationsanleitung

## 1. Abhängigkeiten installieren

Im `apps/api` Verzeichnis:

```bash
cd apps/api
npm install exceljs pdfmake date-fns
npm install -D @types/pdfmake
```

Im `apps/web` Verzeichnis (falls nicht vorhanden):

```bash
cd apps/web
# Keine zusätzlichen Pakete nötig – nutzt fetch API
```

---

## 2. Dateien ins Projekt kopieren

```
apps/api/src/export/
  ├── export.module.ts       ← hier einfügen
  ├── export.controller.ts   ← hier einfügen
  └── export.service.ts      ← hier einfügen

apps/web/src/components/
  └── ExportButtons.tsx      ← hier einfügen
```

---

## 3. ExportModule in app.module.ts registrieren

```typescript
// apps/api/src/app.module.ts
import { ExportModule } from './export/export.module';

@Module({
  imports: [
    // ... andere Module
    ExportModule,   // ← diese Zeile hinzufügen
  ],
})
export class AppModule {}
```

---

## 4. ExportButtons im Frontend einbinden

```tsx
// z.B. in apps/web/src/pages/TimeEntries.tsx
import { ExportButtons } from '../components/ExportButtons';

// Im JSX:
<div className="flex items-center justify-between">
  <h1>Zeiterfassung</h1>
  <ExportButtons />           {/* Alle Mitarbeiter */}
</div>

// Oder nur für einen Mitarbeiter:
<ExportButtons userId={selectedUserId} />
```

---

## 5. API-Endpunkte

| Methode | URL | Beschreibung |
|---------|-----|--------------|
| GET | `/api/export/excel?month=1&year=2025` | Excel für Januar 2025 |
| GET | `/api/export/pdf?month=1&year=2025` | PDF für Januar 2025 |
| GET | `/api/export/excel?year=2025` | Excel für ganzes Jahr |
| GET | `/api/export/excel?from=2025-01-01&to=2025-03-31` | Excel für Zeitraum |
| GET | `/api/export/excel?month=1&year=2025&userId=abc123` | Nur ein Mitarbeiter |

Alle Endpunkte benötigen `Authorization: Bearer <JWT>` Header.  
Nur Rollen **ADMIN** und **DISPO** haben Zugriff.

---

## 6. Was der Export enthält

### Excel (.xlsx)
- **Sheet 1 "Übersicht"**: Alle Mitarbeiter mit Gesamtstunden, Pausen, Netto-Stunden, Ø Stunden/Tag
- **Sheet 2–N**: Pro Mitarbeiter eine eigene Tabelle mit allen Einzeleinträgen + Unterschriftszeile

### PDF (.pdf)
- Pro Mitarbeiter eine Tabelle mit allen Zeiteinträgen
- Unterschriftsfelder für Mitarbeiter und Vorgesetzten
- Seitennummerierung + Exportdatum in der Fußzeile
