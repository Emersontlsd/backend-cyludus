import "dotenv/config";

if (process.env.ENABLE_REFUND_RECONCILIATION !== "true") {
    console.error(
        "Reconciliação desativada. Defina ENABLE_REFUND_RECONCILIATION=true para autorizar a execução.",
    );

    process.exitCode = 1;
} else {
    const { iniciarReconciliacao } = await import("./reconcile-refunds.js");

    process.exitCode = await iniciarReconciliacao();
}