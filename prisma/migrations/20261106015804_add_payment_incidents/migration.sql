-- CreateTable
CREATE TABLE "PaymentIncident" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentIncident_paymentId_idx" ON "PaymentIncident"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentIncident_status_idx" ON "PaymentIncident"("status");

-- AddForeignKey

ALTER TABLE "PaymentIncident"
ADD CONSTRAINT "PaymentIncident_paymentId_fkey"
FOREIGN KEY ("paymentId")
REFERENCES "Payment"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- Impede ocorrências abertas duplicadas
-- do mesmo tipo para o mesmo pagamento.
CREATE UNIQUE INDEX "PaymentIncident_one_open_per_type_key"
ON "PaymentIncident" ("paymentId", "type")
WHERE "status" = 'OPEN';
