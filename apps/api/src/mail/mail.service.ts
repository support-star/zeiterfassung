import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      port: this.config.get<number>('MAIL_PORT', 587),
      secure: this.config.get<string>('MAIL_SECURE', 'false') === 'true',
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });
  }

  private async send(to: string, subject: string, html: string): Promise<boolean> {
    const from = this.config.get<string>('MAIL_FROM', 'Zeiterfassung <noreply@firma.de>');
    try {
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Mail gesendet an ${to}: ${subject}`);
      return true;
    } catch (err) {
      this.logger.error(`Mail fehlgeschlagen an ${to}`, err);
      return false;
    }
  }

  async sendStatusChanged(p: { to: string; workerName: string; date: Date; oldStatus: string; newStatus: string; approverName: string }) {
    const dateStr = format(p.date, 'dd. MMMM yyyy', { locale: de });
    const label = this.statusLabel(p.newStatus);
    const color = this.statusColor(p.newStatus);
    return this.send(p.to, `Zeiteintrag vom ${dateStr} wurde ${label}`,
      this.wrap(`
        <h2 style="color:#1E3A5F">Status-Update</h2>
        <p>Hallo <strong>${p.workerName}</strong>,</p>
        <p>dein Zeiteintrag vom <strong>${dateStr}</strong> hat einen neuen Status:</p>
        <div style="background:#F5F7FA;border-radius:8px;padding:16px;margin:20px 0;text-align:center;">
          <span style="color:#888">${this.statusLabel(p.oldStatus)}</span>
          <span style="margin:0 12px;font-size:20px;">→</span>
          <strong style="color:${color};font-size:16px;">${label}</strong>
        </div>
        <p style="color:#555">Bearbeitet von: <strong>${p.approverName}</strong></p>
        ${p.newStatus === 'APPROVED' ? '<p style="color:#006600">✅ Dein Eintrag wurde genehmigt.</p>' : ''}
        ${p.newStatus === 'DRAFT' ? '<p style="color:#CC6600">⚠️ Bitte prüfen und erneut einreichen.</p>' : ''}
      `));
  }

  async sendEntrySubmitted(p: { to: string; workerName: string; date: Date; netMinutes: number; dashboardUrl: string }) {
    const dateStr = format(p.date, 'dd. MMMM yyyy', { locale: de });
    const h = Math.floor(p.netMinutes / 60);
    const m = p.netMinutes % 60;
    return this.send(p.to, `${p.workerName} hat einen Eintrag eingereicht`,
      this.wrap(`
        <h2 style="color:#1E3A5F">Neuer Eintrag zur Genehmigung</h2>
        <p><strong>${p.workerName}</strong> hat einen Zeiteintrag eingereicht:</p>
        <div style="background:#F5F7FA;border-radius:8px;padding:16px;margin:20px 0;">
          <table style="width:100%"><tr><td style="color:#888">Datum</td><td><strong>${dateStr}</strong></td></tr>
          <tr><td style="color:#888">Netto</td><td><strong style="color:#1E3A5F">${h}:${String(m).padStart(2,'0')} h</strong></td></tr></table>
        </div>
        <a href="${p.dashboardUrl}" style="display:inline-block;background:#1E3A5F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Jetzt genehmigen →</a>
      `));
  }

  async sendDailySummary(p: { to: string; managerName: string; date: Date; pendingCount: number; dashboardUrl: string }) {
    if (p.pendingCount === 0) return true;
    const dateStr = format(p.date, 'dd. MMMM yyyy', { locale: de });
    return this.send(p.to, `${p.pendingCount} offene Einträge warten auf Genehmigung`,
      this.wrap(`
        <h2 style="color:#1E3A5F">Tagesübersicht – ${dateStr}</h2>
        <p>Hallo <strong>${p.managerName}</strong>,</p>
        <p>Es warten <strong style="color:#CC6600;font-size:18px;">${p.pendingCount}</strong> Zeiteinträge auf deine Genehmigung.</p>
        <a href="${p.dashboardUrl}" style="display:inline-block;background:#1E3A5F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;">Zur Übersicht →</a>
      `));
  }

  async sendMonthlyReport(p: { to: string; workerName: string; period: string; netHours: number; overtimeHours: number; grossWageCents?: number }) {
    const overtimeColor = p.overtimeHours >= 0 ? '#006600' : '#CC0000';
    const prefix = p.overtimeHours >= 0 ? '+' : '';
    const grossWageEuro = p.grossWageCents !== undefined ? (p.grossWageCents / 100).toFixed(2) : null;
    return this.send(p.to, `Monatsauswertung ${p.period}`,
      this.wrap(`
        <h2 style="color:#1E3A5F">Monatsauswertung ${p.period}</h2>
        <p>Hallo <strong>${p.workerName}</strong>,</p>
        <div style="background:#F5F7FA;border-radius:8px;padding:20px;margin:20px 0;">
          <table style="width:100%">
            <tr style="border-bottom:1px solid #e0e0e0"><td style="color:#888;padding:8px 0">Netto-Arbeitszeit</td><td style="font-weight:bold;font-size:18px;color:#1E3A5F;text-align:right">${p.netHours.toFixed(2)} h</td></tr>
            <tr style="border-bottom:1px solid #e0e0e0"><td style="color:#888;padding:8px 0">Über-/Unterstunden</td><td style="font-weight:bold;color:${overtimeColor};text-align:right">${prefix}${p.overtimeHours.toFixed(2)} h</td></tr>
            ${grossWageEuro ? `<tr><td style="color:#888;padding:8px 0">Brutto-Lohn</td><td style="font-weight:bold;font-size:18px;text-align:right">${grossWageEuro} €</td></tr>` : ''}
          </table>
        </div>
      `));
  }

  private wrap(content: string): string {
    return `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:0;background:#F0F2F5;font-family:Arial,sans-serif;color:#333">
      <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <div style="background:#1E3A5F;padding:24px 32px"><h1 style="margin:0;color:#fff;font-size:20px">⏱ Zeiterfassung</h1></div>
        <div style="padding:32px">${content}</div>
        <div style="background:#F5F7FA;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0">
          <p style="margin:0;font-size:11px;color:#999">Automatisch generiert · Bitte nicht antworten</p>
        </div>
      </div></body></html>`;
  }

  private statusLabel(s: string) {
    return ({ DRAFT: 'Entwurf', SUBMITTED: 'Eingereicht', APPROVED: 'Genehmigt', LOCKED: 'Gesperrt' }[s] ?? s);
  }

  private statusColor(s: string) {
    return ({ DRAFT: '#888', SUBMITTED: '#CC6600', APPROVED: '#006600', LOCKED: '#0000CC' }[s] ?? '#333');
  }
}
