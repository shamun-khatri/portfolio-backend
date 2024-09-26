-- CreateTable
CREATE TABLE "Experience" (
    "id" SERIAL NOT NULL,
    "img" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "skills" TEXT[],
    "doc" TEXT,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);
