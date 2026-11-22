export function createSimplePopupHTML(
  fundo: number,
  talhao: number,
  zona: number,
  hectares: string,
  onShare: () => void,
  onAddPoi: () => void
): string {
  return `
    <div style="padding: 12px; font-family: Arial, sans-serif; width: 320px; background: white; border-radius: 4px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
        <h3 style="margin: 0; color: #2E7D32; font-size: 14px; font-weight: bold; flex: 1;">Fazenda</h3>
        <button class="popup-close" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #999; padding: 0; width: 20px; height: 20px; flex-shrink: 0;">✕</button>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
        <div style="background: #f5f5f5; padding: 6px; border-radius: 3px;">
          <div style="font-weight: bold; color: #4CAF50; margin-bottom: 2px;">Fundo:</div>
          <div style="color: #333; font-weight: bold;">${fundo}</div>
        </div>
        <div style="background: #f5f5f5; padding: 6px; border-radius: 3px;">
          <div style="font-weight: bold; color: #4CAF50; margin-bottom: 2px;">Talhão:</div>
          <div style="color: #333; font-weight: bold;">${talhao}</div>
        </div>
        <div style="background: #f5f5f5; padding: 6px; border-radius: 3px;">
          <div style="font-weight: bold; color: #4CAF50; margin-bottom: 2px;">Zona:</div>
          <div style="color: #333; font-weight: bold;">${zona}</div>
        </div>
        <div style="background: #f5f5f5; padding: 6px; border-radius: 3px;">
          <div style="font-weight: bold; color: #4CAF50; margin-bottom: 2px;">Hectares:</div>
          <div style="color: #333; font-weight: bold;">${hectares}</div>
        </div>
      </div>
      
      <div style="display: flex; gap: 4px; flex-direction: column;">
        <button class="popup-add-poi" style="width: 100%; background-color: #2196F3; color: white; padding: 6px; border-radius: 3px; font-size: 11px; cursor: pointer; border: none; font-weight: bold;">📍 Anotação</button>
        <button class="popup-share" style="width: 100%; background-color: #4CAF50; color: white; padding: 6px; border-radius: 3px; font-size: 11px; cursor: pointer; border: none; font-weight: bold;">📤 Compartilhar</button>
      </div>
    </div>
  `;
}
