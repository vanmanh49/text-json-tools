import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Panel, { fileDrop } from '../ui/Panel.jsx';
import { IconButton } from '../ui/IconButton.jsx';
import { useText } from '../textStore.js';
import { setText } from '../setText.js';
import { qrSvg } from '../tools.js';

const MAX_SIDE = 1600; // big photos are scaled down so decoding stays fast

// The text of the first QR code found in an image file. jsQR is loaded only when an image is read.
async function readQr(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image.`);
  const [{ default: jsQR }, img] = await Promise.all([
    import('jsqr'),
    createImageBitmap(file).catch(() => { throw new Error(`${file.name} could not be read as an image.`); }),
  ]);
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
  const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d');
  ctx.fillStyle = '#fff'; // transparent pixels would otherwise read as black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
  if (!code) throw new Error('No QR code found in this image.');
  return code.data;
}

// QR Code: text → QR as you type; an image dropped, pasted or opened is read back into the text box.
export default function QrTool({ hidden }) {
  const input = useText('qr-in');
  const [panelErr, setPanelErr] = useState('');
  const file = useRef(null);
  const result = useMemo(() => {
    try { return { svg: qrSvg(input), error: '' }; } catch (e) { return { svg: '', error: e.message }; }
  }, [input]);
  useEffect(() => setPanelErr(''), [input]);

  const read = async f => {
    if (!f) return;
    try { setText('qr-in', await readQr(f)); setPanelErr(''); } catch (e) { setPanelErr(e.message); }
  };

  // Ctrl/⌘+V of an image (a screenshot, "Copy image") while this tool is open. Text pastes as usual.
  useEffect(() => {
    if (hidden) return;
    const onPaste = e => {
      const img = [...(e.clipboardData?.files ?? [])].find(f => f.type.startsWith('image/'));
      if (!img || e.clipboardData.getData('text/plain')) return;
      e.preventDefault();
      read(img);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [hidden]);

  const downloadPng = async () => {
    try {
      const href = await QRCode.toDataURL(input, { errorCorrectionLevel: 'M', width: 1024 });
      Object.assign(document.createElement('a'), { href, download: 'qr-code.png' }).click();
    } catch (e) { setPanelErr(e.message); }
  };

  const drop = fileDrop(read);

  const { svg } = result;
  return (
    <section data-tab="qr" hidden={hidden}>
      <p className="desc">Turn text or a link into a QR code, or read the text from a QR code image. Images never leave your browser.</p>
      <div className="io">
        <Panel id="qr-in" label="Text" ext="txt" tab="qr" className="in" onErr={setPanelErr} />
        <div className="panel">
          <div className="panel-head">
            <span>QR code</span>
            <div className="tools">
              <IconButton id="qr-open" icon="image" label="Open image" title="Read a QR code from an image" onClick={() => file.current.click()} />
              <IconButton id="qr-png" icon="download" label="Download" title="Download PNG" disabled={!svg} onClick={downloadPng} />
            </div>
          </div>
          <div className="editor qr" {...drop}>
            {svg && <img id="qr-img" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)} alt="QR code of the text" />}
            <div className="empty" hidden={!!svg}>
              <p className="empty-hint">Type text to make a QR code.<br />To read one, drop, paste or open an image of it.</p>
            </div>
          </div>
          <input type="file" accept="image/*" hidden ref={file} onChange={e => { read(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>
      <p className="err" role="alert">{result.error || panelErr}</p>
    </section>
  );
}
