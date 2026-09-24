export const PBC_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

const allowedTypes: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel', 'application/x-msexcel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel'],
  txt: ['text/plain'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg']
};

export function validatePbcUpload(file: { name: string; size: number; type?: string }): string | undefined {
  if (!file.name.trim() || !Number.isFinite(file.size) || file.size < 1) return 'Choose a non-empty local file.';
  if (file.size > PBC_UPLOAD_MAX_BYTES) return 'File exceeds the 10 MB PBC upload limit.';
  const extension = file.name.split('.').at(-1)?.toLowerCase() || '';
  const types = allowedTypes[extension];
  if (!types || file.type && file.type !== 'application/octet-stream' && !types.includes(file.type)) return 'Choose a PDF, Word, Excel, CSV, text, PNG or JPEG file.';
}
