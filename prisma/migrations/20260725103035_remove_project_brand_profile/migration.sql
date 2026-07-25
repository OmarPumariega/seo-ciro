/*
  Warnings:

  - You are about to drop the column `notes` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `toneOfVoice` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "notes",
DROP COLUMN "toneOfVoice";
