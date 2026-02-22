import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Admin user ──────────────────────────────────
  const adminPassword = await argon2.hash('Admin1234!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@zeiterfassung.local' },
    update: {},
    create: {
      email: 'admin@zeiterfassung.local',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: 'ADMIN',
    },
  });
  console.log(`  Admin user: ${admin.email}`);

  // ── Dispo user ──────────────────────────────────
  const dispoPassword = await argon2.hash('Dispo1234!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const dispo = await prisma.user.upsert({
    where: { email: 'dispo@zeiterfassung.local' },
    update: {},
    create: {
      email: 'dispo@zeiterfassung.local',
      passwordHash: dispoPassword,
      firstName: 'Lisa',
      lastName: 'Dispo',
      role: 'DISPO',
    },
  });
  console.log(`  Dispo user: ${dispo.email}`);

  // ── Worker users ────────────────────────────────
  const workerPassword = await argon2.hash('Worker1234!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const worker1 = await prisma.user.upsert({
    where: { email: 'max.mustermann@zeiterfassung.local' },
    update: {},
    create: {
      email: 'max.mustermann@zeiterfassung.local',
      passwordHash: workerPassword,
      firstName: 'Max',
      lastName: 'Mustermann',
      role: 'WORKER',
    },
  });
  console.log(`  Worker user: ${worker1.email}`);

  const worker2 = await prisma.user.upsert({
    where: { email: 'anna.schmidt@zeiterfassung.local' },
    update: {},
    create: {
      email: 'anna.schmidt@zeiterfassung.local',
      passwordHash: workerPassword,
      firstName: 'Anna',
      lastName: 'Schmidt',
      role: 'WORKER',
    },
  });
  console.log(`  Worker user: ${worker2.email}`);

  // ── Customers ───────────────────────────────────
  const customer1 = await prisma.customer.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Müller Bau GmbH',
      addressLine1: 'Baustraße 12',
      zip: '80331',
      city: 'München',
      contactName: 'Hans Müller',
      contactPhone: '+49 89 12345678',
      contactEmail: 'info@mueller-bau.de',
    },
  });

  const customer2 = await prisma.customer.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Schmidt Elektrotechnik',
      addressLine1: 'Industrieweg 5',
      zip: '60311',
      city: 'Frankfurt',
      contactName: 'Peter Schmidt',
      contactPhone: '+49 69 87654321',
    },
  });
  console.log(`  Customers: ${customer1.name}, ${customer2.name}`);

  // ── Projects ────────────────────────────────────
  const project1 = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      customerId: customer1.id,
      name: 'Neubau Bürogebäude',
      siteAddressLine1: 'Neubaustraße 1',
      siteZip: '80333',
      siteCity: 'München',
      costCenter: 'KB-2024-001',
      hourlyRateCents: 8500,
    },
  });

  const project2 = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      customerId: customer1.id,
      name: 'Sanierung Altbau',
      siteAddressLine1: 'Altbauweg 7',
      siteZip: '80331',
      siteCity: 'München',
      costCenter: 'KB-2024-002',
      hourlyRateCents: 7500,
    },
  });

  const project3 = await prisma.project.upsert({
    where: { id: '00000000-0000-0000-0000-000000000013' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000013',
      customerId: customer2.id,
      name: 'Elektroinstallation Halle 3',
      siteAddressLine1: 'Industrieweg 5',
      siteZip: '60311',
      siteCity: 'Frankfurt',
      costCenter: 'SE-2024-001',
    },
  });
  console.log(`  Projects: ${project1.name}, ${project2.name}, ${project3.name}`);

  console.log('\nSeed complete!');
  console.log('\nTest credentials:');
  console.log('  Admin:  admin@zeiterfassung.local / Admin1234!');
  console.log('  Dispo:  dispo@zeiterfassung.local / Dispo1234!');
  console.log('  Worker: max.mustermann@zeiterfassung.local / Worker1234!');
  console.log('  Worker: anna.schmidt@zeiterfassung.local / Worker1234!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
