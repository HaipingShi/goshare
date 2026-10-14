import mammoth from 'mammoth/mammoth.browser.js';
import { validateDocxArchive, convertDocx } from '../docx-import.js';

export async function parseDocx(arrayBuffer) {
  validateDocxArchive(arrayBuffer);
  return convertDocx({ arrayBuffer }, mammoth);
}
