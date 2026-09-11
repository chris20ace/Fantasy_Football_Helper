import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const local = process.argv.includes('--local');
const source = path.join(root, 'extensions/espn-connector');
const output = path.join(
  root,
  local ? 'work/espn-connector-local' : 'public/downloads',
);
await mkdir(output, { recursive: true });
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const parts = [],
  index = [];
let offset = 0;
const names = (await readdir(source))
  .filter((n) => /\.(js|json|html|css|md|png)$/.test(n))
  .sort();
for (const name of names) {
  let data = await readFile(path.join(source, name));
  if (local && !name.endsWith('.png')) {
    data = Buffer.from(
      data
        .toString('utf8')
        .replaceAll(
          'https://fantasy-football-helper-orcin.vercel.app',
          'http://localhost:3000',
        )
        .replace(
          'Sunday Desk ESPN Connector',
          'Sunday Desk · LOCAL DEVELOPMENT ONLY',
        ),
    );
  }
  const label = Buffer.from(name),
    crc = crc32(data);
  if (local) await writeFile(path.join(output, name), data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0x0021, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(label.length, 26);
  parts.push(header, label, data);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x0800, 8);
  record.writeUInt16LE(0x0021, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(data.length, 20);
  record.writeUInt32LE(data.length, 24);
  record.writeUInt16LE(label.length, 28);
  record.writeUInt32LE(offset, 42);
  index.push(record, label);
  offset += header.length + label.length + data.length;
}
const directory = Buffer.concat(index),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(names.length, 8);
end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await writeFile(
  path.join(output, 'sunday-desk-espn-connector.zip'),
  Buffer.concat([...parts, directory, end]),
);
console.log(
  local
    ? 'Development-only connector generated under work/espn-connector-local.'
    : 'Public ESPN connector ZIP rebuilt from reviewed source.',
);
