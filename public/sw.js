/*
 * Alias de compatibilidade para instalações antigas em /sw.js.
 * Toda a política de cache vive no worker principal; este arquivo não limpa,
 * não intercepta fetches e não desregistra workers de outros escopos.
 */
try {
  importScripts('/service-worker.js');
} catch (error) {
  // Se o worker principal ainda não estiver disponível, preserve a instalação
  // legada sem executar uma limpeza destrutiva.
  console.warn('[SW alias /sw.js] Não foi possível importar o worker principal:', error);
}
