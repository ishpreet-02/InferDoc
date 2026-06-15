-- CreateEnum
CREATE TYPE "RecallSeverity" AS ENUM ('NOTICE', 'SAFETY', 'RECALL');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "warrantyMonths" INTEGER;

-- CreateTable
CREATE TABLE "Recall" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "RecallSeverity" NOT NULL DEFAULT 'NOTICE',
    "url" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recall_productId_idx" ON "Recall"("productId");

-- AddForeignKey
ALTER TABLE "Recall" ADD CONSTRAINT "Recall_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
