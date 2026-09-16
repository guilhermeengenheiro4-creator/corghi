// Utilitário mínimo de ZIP (leitura via unzipper simples baseado em zlib, escrita STORE sem
// compressão) usado para gerar os formulários de RME preenchidos a partir dos templates
// .docx, sem depender de nenhum binário externo (zip/unzip) no servidor.
const zlib = require('zlib');

function unzip(buffer) {
  const files = {};
  let eocdOffset = buffer.length - 22;
  while (eocdOffset > 0 && buffer.readUInt32LE(eocdOffset) !== 0x06054b50) eocdOffset -= 1;
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < totalEntries; i += 1) {
    const nameLen = buffer.readUInt16LE(centralOffset + 28);
    const extraLen = buffer.readUInt16LE(centralOffset + 30);
    const commentLen = buffer.readUInt16LE(centralOffset + 32);
    const compression = buffer.readUInt16LE(centralOffset + 10);
    const compSize = buffer.readUInt32LE(centralOffset + 20);
    const localOffset = buffer.readUInt32LE(centralOffset + 42);
    const name = buffer.toString('utf8', centralOffset + 46, centralOffset + 46 + nameLen);

    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buffer.subarray(dataStart, dataStart + compSize);
    files[name] = compression === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);

    centralOffset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function zip(files) {
  // files: { [name]: Buffer }
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, data] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const size = data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localParts.push(localHeader, nameBuf, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralStart = offset;
  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

module.exports = { unzip, zip };
