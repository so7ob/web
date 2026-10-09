// Generate meaningful UTF-8 text at an exact byte boundary, without untracked large fixtures.
export function contentAtBytes(size, defaults = true) {
  const doc = { schemaVersion: 1, blocks: Array.from({ length: 2 }, (_, i) => ({ id: 'text' + i, type: 'text', props: { paragraphs: Array(20).fill(''), ...(defaults ? { align: 'start', size: 'base' } : {}) } })) };
  let left = size - Buffer.byteLength(JSON.stringify(doc));
  for (const block of doc.blocks) for (let i = 0; i < 20; i++) {
    const chars = Math.min(5000, Math.floor(left / 2));
    block.props.paragraphs[i] = 'ع'.repeat(chars); left -= chars * 2;
    if (left === 1 && chars < 5000) { block.props.paragraphs[i] += 'a'; left--; }
  }
  if (left !== 0) throw new Error('Fixture outside structural capacity');
  const raw = JSON.stringify(doc);
  if (Buffer.byteLength(raw) !== size) throw new Error('Incorrect byte fixture');
  return raw;
}
