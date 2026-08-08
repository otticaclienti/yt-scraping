// Costruzione di un archivio ZIP (DEFLATE) senza dipendenze esterne.
// Usa CompressionStream('deflate-raw'), disponibile in Chrome moderno.
// Ogni file diventa una voce dello ZIP: un .txt per video + index.csv.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(u8) {
  const cs = new CompressionStream("deflate-raw");
  const stream = new Response(u8).body.pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function concat(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Costruisce lo ZIP. `files` = [{ name, text }]. Restituisce un Blob.
export async function buildZip(files) {
  const enc = new TextEncoder();
  const localChunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const comp = await deflateRaw(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // firma local file header
    lv.setUint16(4, 20, true); // versione necessaria
    lv.setUint16(6, 0x0800, true); // flag: nome file in UTF-8
    lv.setUint16(8, 8, true); // metodo: deflate
    lv.setUint16(10, 0, true); // ora
    lv.setUint16(12, 0x21, true); // data (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    localChunks.push(local, comp);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); // firma central directory
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // offset del local header
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + comp.length;
  }

  const centralBytes = concat(central);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // firma EOCD
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralBytes.length, true);
  ev.setUint32(16, offset, true);

  const all = concat([...localChunks, centralBytes, eocd]);
  return new Blob([all], { type: "application/zip" });
}
