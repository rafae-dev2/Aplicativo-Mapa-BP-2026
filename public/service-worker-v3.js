/*
 * Alias de compatibilidade para instalações antigas em /service-worker-v3.js.
 * Não apaga Cache Storage/IndexedDB e não chama unregister: o worker principal
 * passa a atender o mesmo escopo quando o navegador concluir a atualização.
 */
try {
  importScripts('/service-worker.js');
} catch (error) {
  console.warn('[SW alias /service-worker-v3.js] Não foi possível importar o worker principal:', error);
}
