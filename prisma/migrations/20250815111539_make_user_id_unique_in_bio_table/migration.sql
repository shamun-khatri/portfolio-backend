/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Bio` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Bio_userId_key" ON "Bio"("userId");
