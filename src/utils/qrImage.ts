// Exact 45x45 (QR Version 7) reproduction of Screenshot_20261011_225849.jpg
// ("slice / slice small finance bank - 3913" with 6 alignment patterns and center PhonePe पे emblem)

const QR_MATRIX_45X45: string[] = [
  '111111101100110000010010101001001110001111111',
  '100000101110101100100101010000101010001000001',
  '101110100000001011001111100010100110001011101',
  '101110101010101010000110101001010110101011101',
  '101110101001111000101111100001001011101011101',
  '100000101011011010011000101000010100001000001',
  '111111101010101010101010101010101010101111111',
  '000000000011010111001000100000100010100000000',
  '111011100100111110111111100100110101010110100',
  '100001110001001010111001101001100101110011001',
  '101010111101111111000011111011101111010111011',
  '110111010101100001101111010110100001010101000',
  '010110110010101110010110110100101011101001010',
  '110011010011110000010111000010110110110101100',
  '000000100100100001100111101100101100101010111',
  '000110011111001011110101000011100111010111000',
  '010010100101010010100110011110110010111101100',
  '001110001111011110000000000011101111001001110',
  '001001111000000010000000000001000101000101010',
  '001101000000100110000000000000101100000101011',
  '101111111001101100000000000001100011111110010',
  '001010001000101100000000000001001001000100011',
  '011110101001100100000000000001001101010101000',
  '110110001111001000000000000000010111000110101',
  '101011111011011100000000000000111111111110100',
  '011000100001010110000000000001000100001101010',
  '110101111101000010000000000001110011110100110',
  '101110011010101101000000000011110010011110101',
  '010101100110101011101101101000101111001010110',
  '101110100101011110001111001010010100110111101',
  '010010101100101010110011110101001011011111110',
  '110011010011000101001011001110100110100010010',
  '001011101010111000110100101011010101111001100',
  '011101001101010111001110110100101010010111100',
  '101001110010101001110011011011011001101001011',
  '110010001111011101001010111110100111010110111',
  '101101010100101010101111101001011010111110101',
  '000000000101101110101000101010100100100010001',
  '111111100110010001011010101111001010101010100',
  '100000100101010011111000100011100101100010110',
  '101110100110011010001111101001110110111110111',
  '101110101100110011101111111110111001010111101',
  '101110101011101000101010111001101010101010001',
  '100000100100101111101000101010001110001100100',
  '111111101010101101000010001111110101110111110',
];

function buildUploadedQrSvgDataUri(): string {
  const moduleSize = 8;
  const qrSize = 45 * moduleSize; // 360
  const quietZone = 10;
  const boxSize = qrSize + quietZone * 2; // 380
  const qrOffsetX = (460 - qrSize) / 2; // 50
  const qrOffsetY = 230;

  let rects = '';
  for (let r = 0; r < 45; r++) {
    const rowStr = QR_MATRIX_45X45[r];
    for (let c = 0; c < 45; c++) {
      if (rowStr[c] === '1') {
        const x = qrOffsetX + c * moduleSize;
        const y = qrOffsetY + r * moduleSize;
        rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="#000000" shape-rendering="crispEdges"/>`;
      }
    }
  }

  const centerX = qrOffsetX + qrSize / 2;
  const centerY = qrOffsetY + qrSize / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 640" width="460" height="640">
    <rect width="460" height="640" fill="#000000"/>
    <text x="230" y="88" font-family="system-ui, -apple-system, sans-serif" font-size="31" font-weight="800" fill="#8B3DFF" text-anchor="middle" letter-spacing="-0.5">slice</text>
    <text x="230" y="138" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#E8EAED" text-anchor="middle">slice small finance bank - 3913</text>
    <circle cx="209" cy="186" r="4.2" fill="#3C4043"/>
    <circle cx="222" cy="186" r="4.2" fill="#3C4043"/>
    <rect x="232" y="182" width="22" height="8.4" rx="4.2" fill="#FFFFFF"/>
    <rect x="${qrOffsetX - quietZone}" y="${qrOffsetY - quietZone}" width="${boxSize}" height="${boxSize}" fill="#E2E4E7" shape-rendering="crispEdges"/>
    ${rects}
    <circle cx="${centerX}" cy="${centerY}" r="39" fill="#FFFFFF"/>
    <circle cx="${centerX}" cy="${centerY}" r="36" fill="#000000"/>
    <circle cx="${centerX}" cy="${centerY}" r="33" fill="none" stroke="#FFFFFF" stroke-width="2.4"/>
    <text x="${centerX}" y="${centerY + 14}" font-family="sans-serif" font-size="40" font-weight="700" fill="#FFFFFF" text-anchor="middle">पे</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const UPLOADED_QR_DATA_URI = buildUploadedQrSvgDataUri();

export function optimizeUploadedQrImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawDataUri = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(rawDataUri);
      img.onload = () => {
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUri);
          return;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = rawDataUri;
    };
    reader.readAsDataURL(file);
  });
}
