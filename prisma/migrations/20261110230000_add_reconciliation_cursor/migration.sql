-- CreateTable
CREATE TABLE "ReconciliationCursor" (
    "id" TEXT NOT NULL,
    "lastId" TEXT,
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationCursor_pkey" PRIMARY KEY ("id")
);