/*
  Warnings:

  - You are about to drop the column `porfileImage` on the `Bio` table. All the data in the column will be lost.
  - Added the required column `profileImage` to the `Bio` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Bio" DROP COLUMN "porfileImage",
ADD COLUMN     "profileImage" TEXT NOT NULL;
