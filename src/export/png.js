// PNG export (M4-06): the SVG, drawn onto a canvas in this browser. Nothing is fetched or uploaded.
// The SVG goes in as a `data:` image, which the page's security policy already allows, and has no
// external parts, so the canvas is never tainted and can be read back.

/**
 * @param {string} svg
 * @param {{ width: number, height: number, scale?: number }} size
 * @returns {Promise<Blob>}
 */
export function svgToPngBlob(svg, { width, height, scale = 2 }) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('This browser cannot make a picture here.')); return; }
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be made.'))), 'image/png');
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('The picture could not be drawn.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
