-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "badge" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "instructorDescription" TEXT,
ADD COLUMN     "instructorImageUrl" TEXT,
ADD COLUMN     "observations" TEXT,
ADD COLUMN     "schedule" JSONB,
ADD COLUMN     "subjects" JSONB;
