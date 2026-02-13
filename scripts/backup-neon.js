const { PrismaClient } = require("@prisma/client");
const { PrismaNeonHttp } = require("@prisma/adapter-neon");
const fs = require("fs");
const path = require("path");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const adapter = new PrismaNeonHttp(connectionString, {});
  const prisma = new PrismaClient({ adapter });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(process.cwd(), "backups");
  const backupPath = path.join(backupDir, `neon-backup-${timestamp}.json`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const [
    users,
    bios,
    skills,
    experiences,
    educations,
    projects,
    members,
    customEntityTypes,
    customEntities,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.bio.findMany(),
    prisma.skill.findMany(),
    prisma.experience.findMany(),
    prisma.education.findMany(),
    prisma.project.findMany(),
    prisma.member.findMany(),
    prisma.customEntityType.findMany(),
    prisma.customEntity.findMany(),
  ]);

  const backup = {
    meta: {
      createdAt: new Date().toISOString(),
      source: "neon",
      format: "json",
      note: "Application-level backup via Prisma",
    },
    data: {
      users,
      bios,
      skills,
      experiences,
      educations,
      projects,
      members,
      customEntityTypes,
      customEntities,
    },
  };

  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");

  const rowCount = {
    users: users.length,
    bios: bios.length,
    skills: skills.length,
    experiences: experiences.length,
    educations: educations.length,
    projects: projects.length,
    members: members.length,
    customEntityTypes: customEntityTypes.length,
    customEntities: customEntities.length,
  };

  console.log(`Backup created: ${backupPath}`);
  console.log(`Counts: ${JSON.stringify(rowCount)}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("Backup failed:", error);
  process.exitCode = 1;
});
