-- CreateTable
CREATE TABLE "Education" (
    "id" SERIAL NOT NULL,
    "img" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    "degree" TEXT NOT NULL,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "tags" TEXT[],
    "category" TEXT NOT NULL,
    "github" TEXT NOT NULL,
    "webapp" TEXT NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "img" TEXT,
    "linkedin" TEXT,
    "github" TEXT,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
