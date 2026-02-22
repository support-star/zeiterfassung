/**
 * Seed: 3 Stammkunden + 3 Stammproekte + 15 User-Accounts
 * node seed-data.js
 */

const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const prisma = new PrismaClient();

// ── Benutzer ───────────────────────────────────────────
const USERS = [
  { email: 'samir@kurtech.shop',              firstName: 'Samir',    lastName: 'Admin',       role: 'ADMIN',  password: 'Kurtech2026!' },
  { email: 'thomas.mueller@kurtech.shop',     firstName: 'Thomas',   lastName: 'Müller',      role: 'DISPO',  password: 'Mitarbeiter2026!' },
  { email: 'laura.becker@kurtech.shop',       firstName: 'Laura',    lastName: 'Becker',      role: 'DISPO',  password: 'Mitarbeiter2026!' },
  { email: 'anna.schmidt@kurtech.shop',       firstName: 'Anna',     lastName: 'Schmidt',     role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'markus.weber@kurtech.shop',       firstName: 'Markus',   lastName: 'Weber',       role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'julia.braun@kurtech.shop',        firstName: 'Julia',    lastName: 'Braun',       role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'stefan.fischer@kurtech.shop',     firstName: 'Stefan',   lastName: 'Fischer',     role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'michael.hoffmann@kurtech.shop',   firstName: 'Michael',  lastName: 'Hoffmann',    role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'sarah.meyer@kurtech.shop',        firstName: 'Sarah',    lastName: 'Meyer',       role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'jan.wagner@kurtech.shop',         firstName: 'Jan',      lastName: 'Wagner',      role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'lena.schulz@kurtech.shop',        firstName: 'Lena',     lastName: 'Schulz',      role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'patrick.zimmermann@kurtech.shop', firstName: 'Patrick',  lastName: 'Zimmermann',  role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'nina.krause@kurtech.shop',        firstName: 'Nina',     lastName: 'Krause',      role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'felix.bauer@kurtech.shop',        firstName: 'Felix',    lastName: 'Bauer',       role: 'WORKER', password: 'Mitarbeiter2026!' },
  { email: 'sophie.richter@kurtech.shop',     firstName: 'Sophie',   lastName: 'Richter',     role: 'WORKER', password: 'Mitarbeiter2026!' },
];

// ── Stammkunden ────────────────────────────────────────
const CUSTOMERS = [
  {
    name: 'Bauunternehmen Hoffmann GmbH',
    addressLine1: 'Industriestraße 14',
    zip: '70565',
    city: 'Stuttgart',
    contactName: 'Klaus Hoffmann',
    contactPhone: '+49 711 234567',
    contactEmail: 'k.hoffmann@hoffmann-bau.de',
  },
  {
    name: 'Stadtwerke Karlsruhe AG',
    addressLine1: 'Daxlander Straße 72',
    zip: '76127',
    city: 'Karlsruhe',
    contactName: 'Monika Sauer',
    contactPhone: '+49 721 9873210',
    contactEmail: 'm.sauer@stadtwerke-ka.de',
  },
  {
    name: 'Logistik Zentrum Süd GmbH',
    addressLine1: 'Logistikpark 3',
    zip: '68163',
    city: 'Mannheim',
    contactName: 'Bernd Keller',
    contactPhone: '+49 621 4456780',
    contactEmail: 'b.keller@lz-sued.de',
  },
];

// ── Projekte (werden nach Kunden-Erstellung zugeordnet) ──
const PROJECTS_TEMPLATE = [
  // Hoffmann GmbH
  { customerIndex: 0, name: 'Neubau Wohnanlage Am Hang', siteAddressLine1: 'Am Hang 12', siteZip: '70569', siteCity: 'Stuttgart', costCenter: 'KST-2024-001', hourlyRateCents: 5500 },
  { customerIndex: 0, name: 'Sanierung Bürokomplex Nord', siteAddressLine1: 'Stuttgarter Str. 88', siteZip: '70374', siteCity: 'Stuttgart', costCenter: 'KST-2024-002', hourlyRateCents: 4800 },
  // Stadtwerke
  { customerIndex: 1, name: 'Rohrverlegung Weststadt', siteAddressLine1: 'Westendstraße 45', siteZip: '76185', siteCity: 'Karlsruhe', costCenter: 'SW-KA-001', hourlyRateCents: 5200 },
  { customerIndex: 1, name: 'Umspannwerk Wartung 2024', siteAddressLine1: 'Energieweg 1', siteZip: '76133', siteCity: 'Karlsruhe', costCenter: 'SW-KA-002', hourlyRateCents: 6000 },
  // Logistik Zentrum
  { customerIndex: 2, name: 'Hallenausbau Lager B', siteAddressLine1: 'Logistikpark 3, Halle B', siteZip: '68163', siteCity: 'Mannheim', costCenter: 'LZS-2024-01', hourlyRateCents: 4500 },
  { customerIndex: 2, name: 'Außenbeleuchtung & Sicherheit', siteAddressLine1: 'Logistikpark 3', siteZip: '68163', siteCity: 'Mannheim', costCenter: 'LZS-2024-02', hourlyRateCents: 4200 },
];

async function main() {
  console.log('🚀 Starte Daten-Seed...\n');

  // ── 1. Benutzer ─────────────────────────────────────
  console.log('👤 Benutzer...');
  let created = 0;
  for (const u of USERS) {
    const exists = await prisma.user.findUnique({ where: { email: u.email } });
    if (exists) { process.stdout.write('  ⏭️  '); console.log(u.email); continue; }
    const passwordHash = await argon2.hash(u.password, { type: argon2.argon2id });
    await prisma.user.create({ data: { email: u.email, passwordHash, firstName: u.firstName, lastName: u.lastName, role: u.role, isActive: true } });
    const icon = { ADMIN: '👑', DISPO: '📋', WORKER: '👷' }[u.role];
    process.stdout.write('  ✅ '); console.log(`${icon} ${u.firstName} ${u.lastName} (${u.role})`);
    created++;
  }
  console.log(`  → ${created} neue Accounts angelegt\n`);

  // ── 2. Stammkunden ──────────────────────────────────
  console.log('🏢 Stammkunden...');
  const createdCustomers = [];
  for (const c of CUSTOMERS) {
    let customer = await prisma.customer.findFirst({ where: { name: c.name } });
    if (customer) {
      process.stdout.write('  ⏭️  '); console.log(c.name);
    } else {
      customer = await prisma.customer.create({ data: { ...c, isActive: true } });
      process.stdout.write('  ✅ '); console.log(c.name);
    }
    createdCustomers.push(customer);
  }
  console.log('');

  // ── 3. Stammprojekte ────────────────────────────────
  console.log('🏗️  Stammprojekte...');
  for (const p of PROJECTS_TEMPLATE) {
    const customer = createdCustomers[p.customerIndex];
    const existing = await prisma.project.findFirst({ where: { name: p.name, customerId: customer.id } });
    if (existing) {
      process.stdout.write('  ⏭️  '); console.log(p.name);
      continue;
    }
    await prisma.project.create({
      data: {
        customerId: customer.id,
        name: p.name,
        siteAddressLine1: p.siteAddressLine1,
        siteZip: p.siteZip,
        siteCity: p.siteCity,
        costCenter: p.costCenter,
        hourlyRateCents: p.hourlyRateCents,
        isActive: true,
      },
    });
    process.stdout.write('  ✅ '); console.log(`${p.name} → ${customer.name} (${(p.hourlyRateCents/100).toFixed(2)} €/h)`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 Seed komplett!\n');
  console.log('🔑 Admin-Login:');
  console.log('   E-Mail:    samir@kurtech.shop');
  console.log('   Passwort:  Kurtech2026!\n');
  console.log('👥 Alle Mitarbeiter:');
  console.log('   Passwort:  Mitarbeiter2026!\n');
  console.log('🏢 Kunden: Hoffmann GmbH · Stadtwerke KA · Logistik Zentrum Süd');
  console.log('🏗️  Projekte: 2 pro Kunde (6 gesamt)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch(err => { console.error('\n❌ Fehler:', err.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
