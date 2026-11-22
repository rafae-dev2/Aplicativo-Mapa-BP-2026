export function createPopupHTML(
  fundo: number,
  talhao: number,
  zona: number,
  hectares: string,
  onClose: () => void,
  onShare: () => void,
  onAddPoi: () => void
): HTMLDivElement {
  const container = document.createElement('div');
  container.style.padding = '12px';
  container.style.fontFamily = 'Arial, sans-serif';
  container.style.minWidth = '300px';
  container.style.backgroundColor = 'white';
  container.style.borderRadius = '4px';

  // Header com título e botão de fechar
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '10px';
  header.style.paddingBottom = '8px';
  header.style.borderBottom = '1px solid #eee';

  const title = document.createElement('h3');
  title.textContent = 'Fazenda';
  title.style.margin = '0';
  title.style.color = '#2E7D32';
  title.style.fontSize = '16px';
  title.style.fontWeight = 'bold';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '20px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = '#999';
  closeBtn.style.padding = '0';
  closeBtn.style.width = '24px';
  closeBtn.style.height = '24px';
  closeBtn.addEventListener('click', onClose);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Info em uma linha compacta
  const infoLine = document.createElement('div');
  infoLine.style.display = 'flex';
  infoLine.style.gap = '12px';
  infoLine.style.fontSize = '12px';
  infoLine.style.marginBottom = '10px';
  infoLine.style.flexWrap = 'wrap';

  const createInfoItem = (label: string, value: string) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.gap = '4px';
    item.style.alignItems = 'center';

    const labelEl = document.createElement('span');
    labelEl.textContent = label + ':';
    labelEl.style.fontWeight = 'bold';
    labelEl.style.color = '#4CAF50';

    const valueEl = document.createElement('span');
    valueEl.textContent = value;
    valueEl.style.color = '#333';

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    return item;
  };

  infoLine.appendChild(createInfoItem('Fundo', String(fundo)));
  infoLine.appendChild(createInfoItem('Talhão', String(talhao)));
  infoLine.appendChild(createInfoItem('Zona', String(zona)));
  infoLine.appendChild(createInfoItem('Hectares', hectares));

  // Botões em uma linha
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '6px';
  buttonContainer.style.marginTop = '10px';

  const createButton = (text: string, bgColor: string, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.flex = '1';
    btn.style.backgroundColor = bgColor;
    btn.style.color = 'white';
    btn.style.padding = '8px 10px';
    btn.style.borderRadius = '3px';
    btn.style.fontSize = '12px';
    btn.style.cursor = 'pointer';
    btn.style.border = 'none';
    btn.style.fontWeight = 'bold';
    btn.style.whiteSpace = 'nowrap';
    btn.addEventListener('click', onClick);
    return btn;
  };

  const addPoiBtn = createButton('📍 Anotação', '#2196F3', onAddPoi);
  const shareBtn = createButton('📤 Compartilhar', '#4CAF50', onShare);

  buttonContainer.appendChild(addPoiBtn);
  buttonContainer.appendChild(shareBtn);

  container.appendChild(header);
  container.appendChild(infoLine);
  container.appendChild(buttonContainer);

  return container;
}
