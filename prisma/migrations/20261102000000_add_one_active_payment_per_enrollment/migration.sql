CREATE UNIQUE INDEX "Payment_one_active_per_enrollment_key"
ON "Payment" ("enrollmentId")
WHERE "status" IN ('INITIATING', 'PENDING');