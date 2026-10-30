import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env';

/** Swap this implementation for a self-hosted S3-compatible store later. */
export interface Storage {
  save(buf: Buffer, ext: string): Promise<string>;
  read(name: string): Promise<Buffer>;
  remove(name: string): Promise<void>;
}

class LocalStorage implements Storage {
  private dir = path.resolve(env.UPLOAD_DIR);
  private safe(name: string) {
    if (!/^[a-f0-9]{32}\.(png|jpg)$/.test(name)) throw new Error('bad file name');
    return path.join(this.dir, name);
  }
  async save(buf: Buffer, ext: string) {
    await fs.mkdir(this.dir, { recursive: true });
    const name = `${randomBytes(16).toString('hex')}.${ext}`; // random storage name
    await fs.writeFile(this.safe(name), buf, { flag: 'wx' });
    return name;
  }
  read(name: string) {
    return fs.readFile(this.safe(name));
  }
  async remove(name: string) {
    await fs.rm(this.safe(name), { force: true });
  }
}
export const storage: Storage = new LocalStorage();

export function sniffImage(buf: Buffer): 'png' | 'jpg' | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}
