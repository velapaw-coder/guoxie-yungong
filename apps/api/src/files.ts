import type { Ctx, Upload } from "./types";
import { id, one, run, sha256Hex } from "./util";

export type SavedFile = {
  id: string;
  sha256: string;
  size: number;
  filename: string;
  contentType: string;
  r2Key: string;
};

export async function putFile(ctx: Ctx, upload: Upload, uploadedBy: string | null): Promise<SavedFile> {
  const sha256 = await sha256Hex(upload.bytes);
  const fileId = id();
  const safeName = upload.filename.replace(/[\\/]/g, "_");
  const r2Key = `files/${fileId}/${safeName}`;
  await ctx.bucket.put(r2Key, upload.bytes, { httpMetadata: { contentType: upload.contentType } });
  await run(
    ctx.db,
    `insert into files (id, r2_key, sha256, size, content_type, filename, uploaded_by, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    fileId,
    r2Key,
    sha256,
    upload.bytes.byteLength,
    upload.contentType,
    upload.filename,
    uploadedBy,
    ctx.now(),
  );
  return { id: fileId, sha256, size: upload.bytes.byteLength, filename: upload.filename, contentType: upload.contentType, r2Key };
}

export async function readFile(ctx: Ctx, fileId: string): Promise<{ meta: SavedFile & { uploadedBy: string | null }; bytes: Uint8Array } | null> {
  const row = await one<{
    id: string;
    r2_key: string;
    sha256: string;
    size: number;
    content_type: string;
    filename: string;
    uploaded_by: string | null;
  }>(ctx.db, "select * from files where id = ?", fileId);
  if (!row) return null;
  const object = await ctx.bucket.get(row.r2_key);
  if (!object) return null;
  return {
    meta: {
      id: row.id,
      sha256: row.sha256,
      size: row.size,
      filename: row.filename,
      contentType: row.content_type,
      r2Key: row.r2_key,
      uploadedBy: row.uploaded_by,
    },
    bytes: new Uint8Array(await object.arrayBuffer()),
  };
}
