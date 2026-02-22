import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      port: this.config.get<number>('MAIL_PORT', 587),
      secure: this.config.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });
  }

  async send(options: MailOptions): Promise<boolean> {
    const from = this.config.get<string>('MAIL_FROM', 'Zeiterfassung <noreply@firma.de>');
    try {
      await this.transporter.sendMail({ from, ...options });
      this.logger.log(`Mail gesendet an ${options.to}: ${options.subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Mail fehlgeschlagen an ${options.to}`, err);
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Vorgefertigte E-Mail-Templates
  // ─────────────────────────────────────────────────────────────

  async sendStatusChanged(payload: {
    to: string;
    workerName: string;
    date: Date;
    oldStatus: string;
    newStatus: string;
    approverName: string;
  }) {
    const dateStr = format(payload.date, 'dd. MMMM yyyy', { locale: de });
    const statusLabel = this.statusLabel(payload.newStatus);
    const statusColor = this.statusColor(payload.newStatus);

    return this.send({
      to: payload.to,
      subject: `Zeiterfassung: Dein Eintrag vom ${dateStr} wurde ${statusLabel}`,
      html: this.wrapTemplate(`
        <h2 style="color:#1E3A5F;margin-bottom:8px;">Status-Update</h2>
        <p>Hallo <strong>${payload.workerName}</strong>,</p>
        <p>dein Zeiteintrag vom <strong>${dateStr}</strong> hat einen neuen Status erhalten:</p>

        <div style="background:#F5F7FA;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
          <span style="font-size:13px;color:#888;">${this.statusLabel(payload.oldStatus)}</span>
          <span style="margin:0 12px;font-size:20px;">→</span>
          <span style="font-size:16px;font-weight:bold;color:${statusColor};">${statusLabel}</span>
        </div>

        <p style="color:#555;">Bearbeitet von: <strong>${payload.approverName}</strong></p>
        ${
          payload.newStatus === 'APPROVED'
            ? '<p style="color:#006600;">✅ Dein Eintrag wurde erfolgreich genehmigt.</p>'
            : ''
        }
        ${
          payload.newStatus === 'DRAFT'
            ? '<p style="color:#CC6600;">⚠️ Dein Eintrag wurde zurückgesetzt. Bitte prüfe und reiche ihn erneut ein.</p>'
            : ''
        }
      `),
    });
  }

  async sendEntrySubmitted(payload: {
    to: string; // E-Mail des Vorgesetzten
    workerName: string;
    date: Date;
    netMinutes: number;
    dashboardUrl: string;
  }) {
    const dateStr = format(payload.date, 'dd. MMMM yyyy', { locale: de });
    const netHours = this.minutesToTime(payload.netMinutes);

    return this.send({
      to: payload.to,
      subject: `Zeiterfassung: ${payload.workerName} hat einen Eintrag eingereicht`,
      html: this.wrapTemplate(`
        <h2 style="color:#1E3A5F;margin-bottom:8px;">Neuer Eintrag zur Genehmigung</h2>
        <p><strong>${payload.workerName}</strong> hat einen Zeiteintrag eingereicht:</p>

        <div style="background:#F5F7FA;border-radius:8px;padding:16px;margin:20px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#888;padding:4px 0;">Datum</td>
              <td style="font-weight:bold;">${dateStr}</td>
            </tr>
            <tr>
              <td style="color:#888;padding:4px 0;">Netto-Arbeitszeit</td>
              <td style="font-weight:bold;color:#1E3A5F;">${netHours}</td>
            </tr>
          </table>
        </div>

        <a href="${payload.dashboardUrl}" 
           style="display:inline-block;background:#1E3A5F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Jetzt genehmigen →
        </a>
      `),
    });
  }

  async sendDailySummary(payload: {
    to: string;
    managerName: string;
    date: Date;
    pendingCount: number;
    dashboardUrl: string;
  }) {
    if (payload.pendingCount === 0) return true; // Keine E-Mail wenn nichts offen
    const dateStr = format(payload.date, 'dd. MMMM yyyy', { locale: de });

    return this.send({
      to: payload.to,
      subject: `Zeiterfassung: ${payload.pendingCount} offene Einträge warten auf Genehmigung`,
      html: this.wrapTemplate(`
        <h2 style="color:#1E3A5F;">Tagesübersicht – ${dateStr}</h2>
        <p>Hallo <strong>${payload.managerName}</strong>,</p>
        <p>es warten <strong style="color:#CC6600;font-size:18px;">${payload.pendingCount}</strong> Zeiteinträge auf deine Genehmigung.</p>

        <a href="${payload.dashboardUrl}"
           style="display:inline-block;background:#1E3A5F;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;">
          Zur Übersicht →
        </a>
      `),
    });
  }

  async sendMonthlyReport(payload: {
    to: string;
    workerName: string;
    period: string;
    netHours: number;
    overtimeHours: number;
    grossWage?: number;
  }) {
    const overtimeColor = payload.overtimeHours >= 0 ? '#006600' : '#CC0000';
    const overtimePrefix = payload.overtimeHours >= 0 ? '+' : '';

    return this.send({
      to: payload.to,
      subject: `Zeiterfassung: Deine Auswertung für ${payload.period}`,
      html: this.wrapTemplate(`
        <h2 style="color:#1E3A5F;">Monatsauswertung ${payload.period}</h2>
        <p>Hallo <strong>${payload.workerName}</strong>,</p>
        <p>hier ist deine Zusammenfassung für <strong>${payload.period}</strong>:</p>

        <div style="background:#F5F7FA;border-radius:8px;padding:20px;margin:20px 0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="color:#888;padding:8px 0;">Netto-Arbeitszeit</td>
              <td style="font-weight:bold;font-size:18px;color:#1E3A5F;text-align:right;">${payload.netHours.toFixed(2)} h</td>
            </tr>
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="color:#888;padding:8px 0;">Über-/Unterstunden</td>
              <td style="font-weight:bold;color:${overtimeColor};text-align:right;">${overtimePrefix}${payload.overtimeHours.toFixed(2)} h</td>
            </tr>
            ${
              payload.grossWage !== undefined
                ? `<tr>
                <td style="color:#888;padding:8px 0;">Brutto-Lohn</td>
                <td style="font-weight:bold;font-size:18px;text-align:right;">${payload.grossWage.toFixed(2)} €</td>
              </tr>`
                : ''
            }
          </table>
        </div>
        <p style="font-size:12px;color:#888;">Diese Auswertung wurde automatisch generiert.</p>
      `),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Hilfsmethoden
  // ─────────────────────────────────────────────────────────────

  private wrapTemplate(content: string): string {
    return `
      <!DOCTYPE html>
      <html lang="de">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#F0F2F5;font-family:Arial,sans-serif;color:#333;">
        <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <div style="background:#1E3A5F;padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:20px;letter-spacing:0.5px;">⏱ Zeiterfassung</h1>
          </div>
          <!-- Content -->
          <div style="padding:32px;">
            ${content}
          </div>
          <!-- Footer -->
          <div style="background:#F5F7FA;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0;">
            <p style="margin:0;font-size:11px;color:#999;">
              Diese E-Mail wurde automatisch von der Zeiterfassungs-App versendet.<br>
              Bitte nicht direkt antworten.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'Entwurf', SUBMITTED: 'Eingereicht',
      APPROVED: 'Genehmigt', LOCKED: 'Gesperrt',
    };
    return map[status] ?? status;
  }

  private statusColor(status: string): string {
    const map: Record<string, string> = {
      DRAFT: '#888888', SUBMITTED: '#CC6600',
      APPROVED: '#006600', LOCKED: '#0000CC',
    };
    return map[status] ?? '#333333';
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(Math.abs(minutes) / 60);
    const m = Math.abs(minutes) % 60;
    return `${h}:${m.toString().padStart(2, '0')} h`;
  }
}
