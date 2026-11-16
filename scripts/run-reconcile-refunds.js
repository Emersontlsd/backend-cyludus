import { iniciarReconciliacao } from "./reconcile-refunds.js";

process.exitCode = await iniciarReconciliacao();